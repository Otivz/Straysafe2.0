import re

with open("c:/Users/User/Desktop/Straysafe2.0/Database.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
for i, line in enumerate(lines):
    if "CREATE TABLE" in line:
        print(f"Line {i+1}: {line.strip()}")
    if "endorsement_letters" in line or "letter_status" in line or "holding_log_id" in line:
        print(f"Match found at line {i+1}: {line.strip()}")
