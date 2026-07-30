code = '''import java.sql.*;
import java.io.*;
import java.util.*;

public class ExportCubrid {
    public static void main(String[] args) {
        try {
            Class.forName("cubrid.jdbc.driver.CUBRIDDriver");
            Connection conn = DriverManager.getConnection("jdbc:cubrid:192.168.0.221:30000:dialect:::", "dialect", "dialect1!");
            System.out.println("CUBRID Connected successfully!");

            DatabaseMetaData meta = conn.getMetaData();
            ResultSet rs = meta.getTables(null, null, "%", new String[]{"TABLE"});
            
            List<String> tables = new ArrayList<>();
            while (rs.next()) {
                String tableName = rs.getString("TABLE_NAME");
                if (!tableName.startsWith("_")) {
                    tables.add(tableName);
                }
            }
            rs.close();
            
            System.out.println("Found User Tables: " + tables);
            
            for (String table : tables) {
                System.out.println("Exporting table: " + table);
                Statement stmt = conn.createStatement();
                ResultSet trs = stmt.executeQuery("SELECT * FROM \\"" + table + "\\"");
                ResultSetMetaData trsMeta = trs.getMetaData();
                int colCount = trsMeta.getColumnCount();
                
                int count = 0;
                while (trs.next()) {
                    count++;
                }
                System.out.println("  Table " + table + " row count: " + count);
                trs.close();
                stmt.close();
            }

            conn.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
'''

with open("/tmp/ExportCubrid.java", "w", encoding="utf-8") as f:
    f.write(code)

print("Created /tmp/ExportCubrid.java")
