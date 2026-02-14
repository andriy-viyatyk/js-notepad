[← Home](./index.md)

# File Encryption

js-notepad can encrypt and decrypt text files using a password. Encrypted files are saved with AES-256-GCM encryption and can only be opened with the correct password.

## Encrypting a File

1. Open a text file (or create a new one)
2. Right-click the tab and select **Encrypt**
3. Enter a password and confirm it
4. Click **Encrypt**

The file content is now encrypted. A lock icon appears on the tab to indicate the file is encrypted. Save the file to persist the encryption to disk.

## Opening an Encrypted File

When you open a file that was previously encrypted:

1. The encryption panel appears automatically
2. Enter the password
3. Click **Decrypt**

If the password is correct, the file content is decrypted and displayed in the editor. The lock icon on the tab indicates the file is encrypted but currently decrypted for editing.

## Changing the Password

1. Right-click the tab of a decrypted file
2. Select **Change Password**
3. Enter the new password and confirm it
4. Click **Encrypt**

## Removing Encryption

To permanently remove encryption from a file:

1. Open and decrypt the file with its password
2. Right-click the tab
3. Select **Make Unencrypted**

The file reverts to plain text. Save to persist the change.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit password |
| `Escape` | Cancel and close the encryption panel |

## Technical Details

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key derivation**: PBKDF2 with 100,000 iterations
- **Encryption marker**: Encrypted files begin with a version prefix (`ENC-v001:`) followed by Base64-encoded data
- **What's encrypted**: The entire file content is encrypted as a single block

## Important Notes

- **Remember your password** — there is no way to recover content if you forget it
- **Encryption is per-file** — each file has its own password
- Encryption is only available for text-based files, not PDF or images
- The encrypted content is stored as Base64 text, so the file remains a valid text file
