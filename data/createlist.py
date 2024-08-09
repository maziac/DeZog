import re

# cat addr2.list | sed '/:$/d' | grep -v '^$' | sort | awk '!seen[substr($0, 1, 4)]++' > addr2sort.list


def read_file(file_path):
    with open(file_path, 'r') as file:
        return file.readlines()

def is_hex_address(s):
    return re.match(r'^[0-9A-Fa-f]{4,8}', s) is not None

def is_comment(s):
    return s.strip().startswith(';')

def is_mnemonic(s):
    # Is not a DEFB
    if re.match(r'^\s+DEFB', s) is not None:
        return False
    # Is not an empty line
    if re.match(r'^\s*$', s) is not None:
        return False
    # Does not start at column 0
    return re.match(r'^\s', s) is not None

def main(file_a_path, file_b_path, output_path):
    # Read the content of both files
    file_a_lines = read_file(file_a_path)
    file_b_lines = read_file(file_b_path)

    # Process file_b to get addresses
    addresses = [line[:4] for line in file_b_lines]
    pad = 18
    addresses_full = [line[:pad].strip().ljust(pad, ' ') for line in file_b_lines ]

    address_index = 0
    output_lines = []

    k = 0
    cut_line = 8
    for line in file_a_lines:
        k = k+1
        if k == 280:
            print (line)
        if is_comment(line):
            # Line is a comment, append it as is
            output_lines.append(line)
        elif is_hex_address(line):
            # Line starts with a hex address, find this address in file_b
            try:
                addr = line.split()[0]
                address_index = addresses.index(addr)
            except ValueError:
                print(f"Address {addr} not found in file_b.")
                address_index = 0
                output_lines.append(line)
                continue
            full_line = addresses_full[address_index]
            new_line = f"{full_line}{line[cut_line:]}"
            output_lines.append(new_line)
            address_index += 1
        elif is_mnemonic(line) and address_index != 0:
            if address_index < len(addresses):
                # Insert the next address from file_b
                full_line = addresses_full[address_index]
                new_line = f"{full_line}{line[cut_line:]}"
                output_lines.append(new_line)
                address_index += 1
            else:
                # No more addresses left in file_b, append line as is
                output_lines.append(line)
        else:
            # E.g. "   DEFB" or "#define"
            output_lines.append(line)

    # Write the output to a new file
    with open(output_path, 'w') as output_file:
        output_file.writelines(output_lines)

# Replace 'file_a.txt', 'file_b.txt', and 'output.txt' with your actual file paths
main('/Volumes/SDDPCIE2TB/Projects/vscode/DeZog/data/listings/zx81-rom.list', '/Volumes/SDDPCIE2TB/Projects/vscode/DeZog/data/addr2sort.list', '/Volumes/SDDPCIE2TB/Projects/vscode/DeZog/data/output.list')
