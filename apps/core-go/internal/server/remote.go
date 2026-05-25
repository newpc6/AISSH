package server

import (
	"fmt"
	"io"
	"net/http"
	pathpkg "path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

func newSSHClient(host hostRecord) (*ssh.Client, error) {
	addr := fmt.Sprintf("%s:%d", host.Address, host.Port)
	authMethods := []ssh.AuthMethod{}
	if host.AuthType == "password" && host.Password != "" {
		authMethods = append(authMethods, ssh.Password(host.Password))
	}
	if host.AuthType == "privateKey" && host.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(host.PrivateKey))
		if err != nil {
			return nil, err
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	return ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User:            host.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	})
}

func withSFTPClient(host hostRecord, fn func(*sftp.Client) error) error {
	client, err := newSSHClient(host)
	if err != nil {
		return err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return err
	}
	defer sftpClient.Close()

	return fn(sftpClient)
}

func listRemoteFiles(host hostRecord, remotePath string) (fileListResponse, error) {
	if remotePath == "" {
		remotePath = "."
	}

	var response fileListResponse
	err := withSFTPClient(host, func(client *sftp.Client) error {
		cleanPath := pathpkg.Clean(remotePath)
		infos, err := client.ReadDir(cleanPath)
		if err != nil {
			return err
		}

		entries := make([]fileEntry, 0, len(infos))
		for _, info := range infos {
			entryType := "file"
			if info.IsDir() {
				entryType = "directory"
			}
			entries = append(entries, fileEntry{
				Name:       info.Name(),
				Path:       pathpkg.Join(cleanPath, info.Name()),
				Type:       entryType,
				Size:       info.Size(),
				ModifiedAt: info.ModTime().UTC().Format(time.RFC3339),
			})
		}

		sort.SliceStable(entries, func(i, j int) bool {
			if entries[i].Type != entries[j].Type {
				return entries[i].Type == "directory"
			}
			return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
		})

		response = fileListResponse{Path: cleanPath, Entries: entries}
		return nil
	})

	return response, err
}

func downloadRemoteFile(host hostRecord, remotePath string, w http.ResponseWriter) error {
	return withSFTPClient(host, func(client *sftp.Client) error {
		remoteFile, err := client.Open(remotePath)
		if err != nil {
			return err
		}
		defer remoteFile.Close()

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, pathpkg.Base(remotePath)))
		_, err = io.Copy(w, remoteFile)
		return err
	})
}

func uploadRemoteFile(host hostRecord, remoteDir string, r *http.Request) error {
	if remoteDir == "" {
		remoteDir = "."
	}

	if err := r.ParseMultipartForm(256 << 20); err != nil {
		return err
	}

	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		return fmt.Errorf("no files uploaded")
	}

	return withSFTPClient(host, func(client *sftp.Client) error {
		for _, header := range files {
			source, err := header.Open()
			if err != nil {
				return err
			}

			targetPath := pathpkg.Join(pathpkg.Clean(remoteDir), filepath.Base(header.Filename))
			target, err := client.Create(targetPath)
			if err != nil {
				_ = source.Close()
				return err
			}

			_, copyErr := io.Copy(target, source)
			closeErr := target.Close()
			_ = source.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		}
		return nil
	})
}

func collectServerMetrics(host hostRecord) (serverMetrics, error) {
	metrics := serverMetrics{
		HostID:      host.ID,
		CollectedAt: time.Now().UTC().Format(time.RFC3339),
	}

	client, err := newSSHClient(host)
	if err != nil {
		return metrics, err
	}
	defer client.Close()

	output, err := runSSHCommand(client, "printf 'cpu='; awk 'NR==1 {total=$2+$3+$4+$5+$6+$7+$8; idle=$5; printf \"%d\\n\", (total-idle)*100/total}' /proc/stat; printf 'mem='; free | awk '/Mem:/ {printf \"%d\\n\", $3*100/$2}'; printf 'disk='; df -P / | awk 'NR==2 {gsub(\"%\", \"\", $5); print $5}'; printf 'net='; awk 'NR>2 {rx+=$2; tx+=$10} END {printf \"%d %d\\n\", rx, tx}' /proc/net/dev")
	if err != nil {
		return metrics, err
	}

	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		switch key {
		case "cpu":
			metrics.CPUPercent = parsePercent(value)
		case "mem":
			metrics.MemoryPercent = parsePercent(value)
		case "disk":
			metrics.DiskPercent = parsePercent(value)
		case "net":
			fields := strings.Fields(value)
			if len(fields) == 2 {
				metrics.NetworkRxBytes, _ = strconv.ParseInt(fields[0], 10, 64)
				metrics.NetworkTxBytes, _ = strconv.ParseInt(fields[1], 10, 64)
			}
		}
	}

	return metrics, nil
}

func parsePercent(value string) int {
	percent, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0
	}
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return percent
}

func runSSHCommand(client *ssh.Client, command string) (string, error) {
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	return string(output), err
}
