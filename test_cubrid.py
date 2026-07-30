import jpype
import jaydebeapi
import os

JAVA_HOME = "/opt/homebrew/opt/openjdk@17"
os.environ["JAVA_HOME"] = JAVA_HOME

jvm_path = f"{JAVA_HOME}/libexec/openjdk.jdk/Contents/Home/lib/server/libjvm.dylib"
jar_file = "/tmp/cubrid-jdbc.jar"

if not jpype.isJVMStarted():
    jpype.startJVM(jvm_path, f"-Djava.class.path={jar_file}")

driver = "cubrid.jdbc.driver.CUBRIDDriver"
url = "jdbc:cubrid:192.168.0.221:30000:dialect:::"
user = "dialect"
password = "dialect1!"

print("Connecting to CUBRID...")
try:
    conn = jaydebeapi.connect(driver, url, [user, password], jar_file)
    curs = conn.cursor()
    print("Connected successfully!")
    
    # Get table list
    curs.execute("SELECT class_name FROM _db_class WHERE is_user_class = 'YES'")
    tables = [row[0] for row in curs.fetchall()]
    print("User Tables:", tables)
    
    curs.close()
    conn.close()
except Exception as e:
    print("Error:", e)
