package server

import (
	"fmt"
	"io"
	"net/http"
	"os"
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
	var response fileListResponse
	err := withSFTPClient(host, func(client *sftp.Client) error {
		cleanPath := normalizeRemotePathForRequest(remotePath)
		listPath := cleanPath
		if resolvedPath, err := client.RealPath(cleanPath); err == nil && strings.TrimSpace(resolvedPath) != "" {
			listPath = pathpkg.Clean(resolvedPath)
		}

		infos, err := client.ReadDir(listPath)
		if err != nil && listPath != cleanPath {
			listPath = cleanPath
			infos, err = client.ReadDir(listPath)
		}
		if err != nil {
			return err
		}

		entries := make([]fileEntry, 0, len(infos))
		for _, info := range infos {
			entryPath := pathpkg.Join(listPath, info.Name())
			entryType := "file"
			if remoteInfoIsDirectory(client, entryPath, info) {
				entryType = "directory"
			}
			entries = append(entries, fileEntry{
				Name:       info.Name(),
				Path:       entryPath,
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

		response = fileListResponse{Path: listPath, Entries: entries}
		return nil
	})

	return response, err
}

func remoteInfoIsDirectory(client *sftp.Client, remotePath string, info os.FileInfo) bool {
	if info.IsDir() {
		return true
	}
	if info.Mode()&os.ModeSymlink == 0 {
		return false
	}
	targetInfo, err := client.Stat(remotePath)
	return err == nil && targetInfo.IsDir()
}

func normalizeRemotePathForRequest(remotePath string) string {
	return pathpkg.Clean(strings.TrimSpace(remotePath))
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

	output, err := runSSHCommand(client, "cat /proc/stat; printf '\\n__AI_SSH_STAT2__\\n'; sleep 0.25; cat /proc/stat; printf '\\n__AI_SSH_MEMINFO__\\n'; cat /proc/meminfo; printf '\\n__AI_SSH_DF__\\n'; df -P; printf '\\n__AI_SSH_NETDEV__\\n'; cat /proc/net/dev")
	if err != nil {
		return metrics, err
	}

	metrics.CPUPercent = parseCPUPercent(output)
	metrics.MemoryPercent, metrics.MemoryUsedBytes, metrics.MemoryTotalBytes = parseMemoryMetrics(output)
	metrics.Disks, metrics.DiskPercent = parseDiskMetrics(output)
	metrics.NetworkRxBytes, metrics.NetworkTxBytes = parseNetworkTotals(output)
	return metrics, nil
}

func parseCPUPercent(output string) int {
	firstTotal, firstIdle, firstOK := parseFirstCPUStat(metricSection(output, "", "__AI_SSH_STAT2__"))
	secondTotal, secondIdle, secondOK := parseFirstCPUStat(metricSection(output, "__AI_SSH_STAT2__", "__AI_SSH_MEMINFO__"))
	if firstOK && secondOK && secondTotal > firstTotal {
		totalDelta := secondTotal - firstTotal
		idleDelta := secondIdle - firstIdle
		return parsePercent(strconv.FormatInt((totalDelta-idleDelta)*100/totalDelta, 10))
	}
	return 0
}

func parseFirstCPUStat(section string) (int64, int64, bool) {
	for _, line := range strings.Split(section, "\n") {
		if strings.HasPrefix(line, "cpu ") {
			return parseCPUStat(strings.TrimPrefix(line, "cpu "))
		}
	}
	return 0, 0, false
}

func parseCPUStat(value string) (int64, int64, bool) {
	fields := strings.Fields(value)
	if len(fields) < 4 {
		return 0, 0, false
	}
	var total int64
	for _, field := range fields {
		value, err := strconv.ParseInt(field, 10, 64)
		if err != nil {
			return 0, 0, false
		}
		total += value
	}
	idle, idleErr := strconv.ParseInt(fields[3], 10, 64)
	if len(fields) > 4 {
		iowait, err := strconv.ParseInt(fields[4], 10, 64)
		if err == nil {
			idle += iowait
		}
	}
	return total, idle, idleErr == nil
}

func parseMemoryPercent(output string) int {
	percent, _, _ := parseMemoryMetrics(output)
	return percent
}

func parseMemoryMetrics(output string) (int, int64, int64) {
	section := metricSection(output, "__AI_SSH_MEMINFO__", "__AI_SSH_DF__")
	values := map[string]int64{}
	for _, line := range strings.Split(section, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := strings.TrimSuffix(fields[0], ":")
		value, err := strconv.ParseInt(fields[1], 10, 64)
		if err == nil {
			values[key] = value
		}
	}
	total := values["MemTotal"]
	available := values["MemAvailable"]
	if available == 0 {
		available = values["MemFree"] + values["Buffers"] + values["Cached"]
	}
	if total <= 0 {
		return 0, 0, 0
	}
	used := total - available
	return parsePercent(strconv.FormatInt(used*100/total, 10)), used * 1024, total * 1024
}

func parseDiskMetrics(output string) ([]diskMetric, int) {
	section := metricSection(output, "__AI_SSH_DF__", "__AI_SSH_NETDEV__")
	disks := []diskMetric{}
	diskPercent := 0
	for _, line := range strings.Split(section, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 6 || fields[0] == "Filesystem" {
			continue
		}
		mount := fields[len(fields)-1]
		if shouldSkipMount(mount) {
			continue
		}
		metric := diskMetric{
			Mount:       mount,
			Filesystem:  fields[0],
			UsedPercent: parsePercent(strings.TrimSuffix(fields[4], "%")),
		}
		disks = append(disks, metric)
		if metric.Mount == "/" || metric.UsedPercent > diskPercent {
			diskPercent = metric.UsedPercent
		}
	}
	return disks, diskPercent
}

func shouldSkipMount(mount string) bool {
	return mount == "/dev" ||
		mount == "/run" ||
		mount == "/sys" ||
		mount == "/proc" ||
		strings.HasPrefix(mount, "/dev/") ||
		strings.HasPrefix(mount, "/run/") ||
		strings.HasPrefix(mount, "/sys/") ||
		strings.HasPrefix(mount, "/proc/")
}

func parseNetworkTotals(output string) (int64, int64) {
	section := metricSection(output, "__AI_SSH_NETDEV__", "")
	var rx int64
	var tx int64
	for _, line := range strings.Split(section, "\n") {
		if !strings.Contains(line, ":") {
			continue
		}
		_, value, _ := strings.Cut(line, ":")
		fields := strings.Fields(value)
		if len(fields) < 16 {
			continue
		}
		rxValue, rxErr := strconv.ParseInt(fields[0], 10, 64)
		txValue, txErr := strconv.ParseInt(fields[8], 10, 64)
		if rxErr == nil {
			rx += rxValue
		}
		if txErr == nil {
			tx += txValue
		}
	}
	return rx, tx
}

func metricSection(output string, startMarker string, endMarker string) string {
	start := 0
	if startMarker != "" {
		index := strings.Index(output, startMarker)
		if index < 0 {
			return ""
		}
		start = index + len(startMarker)
	}
	section := output[start:]
	if endMarker != "" {
		if index := strings.Index(section, endMarker); index >= 0 {
			section = section[:index]
		}
	}
	return section
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
