import bcrypt
passwords = ["Trust@2024", "Trust@2024", "Trust@2024"]
for p in passwords:
    hashed = bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
    print(hashed)
