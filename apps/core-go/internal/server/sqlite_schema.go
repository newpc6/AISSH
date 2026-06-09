package server

import (
	"database/sql"
	"fmt"
	"strings"
)

type sqliteColumnSpec struct {
	Name       string
	Definition string
}

func ensureSQLiteColumns(db *sql.DB, table string, columns []sqliteColumnSpec) error {
	rows, err := db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, quoteSQLiteIdentifier(table)))
	if err != nil {
		return err
	}
	defer rows.Close()

	existing := map[string]struct{}{}
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return err
		}
		existing[strings.TrimSpace(name)] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, column := range columns {
		name := strings.TrimSpace(column.Name)
		definition := strings.TrimSpace(column.Definition)
		if name == "" || definition == "" {
			continue
		}
		if _, ok := existing[name]; ok {
			continue
		}
		if _, err := db.Exec(fmt.Sprintf(
			`ALTER TABLE %s ADD COLUMN %s %s`,
			quoteSQLiteIdentifier(table),
			quoteSQLiteIdentifier(name),
			definition,
		)); err != nil {
			return err
		}
	}
	return nil
}

func quoteSQLiteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(strings.TrimSpace(name), `"`, `""`) + `"`
}
