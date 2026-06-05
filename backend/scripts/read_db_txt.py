encodings = ['utf-16', 'utf-16-le', 'utf-16-be', 'utf-8', 'latin-1']
for enc in encodings:
    try:
        with open("c:/Users/User/Desktop/Straysafe2.0/Database.txt", "r", encoding=enc) as f:
            content = f.read(100)
            if "DROP DATABASE" in content or "roles" in content or "ROLES" in content:
                print(f"Success! Encoding is: {enc}")
                break
    except Exception as e:
        print(f"Failed with {enc}: {e}")
