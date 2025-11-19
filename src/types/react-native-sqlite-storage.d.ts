declare module 'react-native-sqlite-storage' {
  export interface SQLiteDatabase {
    executeSql(
      statement: string,
      params?: any[],
      success?: (tx: any, results: ResultSet) => void,
      error?: (error: any) => void
    ): Promise<[ResultSet]>;
    close(): Promise<void>;
  }

  export interface ResultSet {
    insertId?: number;
    rowsAffected: number;
    rows: ResultSetRowList;
  }

  export interface ResultSetRowList {
    length: number;
    item(index: number): any;
  }

  export interface DatabaseParams {
    name: string;
    location?: string;
  }

  const SQLite: {
    openDatabase(params: DatabaseParams): Promise<SQLiteDatabase>;
    DEBUG(debug: boolean): void;
    enablePromise(enable: boolean): void;
    SQLiteDatabase: SQLiteDatabase;
  };

  export default SQLite;
}
