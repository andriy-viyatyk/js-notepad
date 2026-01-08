const algorithm = {
    name: 'AES-GCM',
    length: 256,
};

const ENCRYPTION_VERSION_V1 = 'ENC-v001:';

export function encryptionVersion(content: string): number | undefined {
    const match = content.match(/^ENC-v(\d+):/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return undefined;
}

export function isEncrypted(content: string): boolean {
    const version = encryptionVersion(content);
    return version !== undefined && version > 0;
}

async function getKeyFromPassword(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode('saltgggdd@#4d;lj)(hnl23674UU'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        algorithm,
        false,
        ['encrypt', 'decrypt']
    );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const u8Array = new Uint8Array(buffer);
    const binary = u8Array.reduce((acc, i) => {
        const char = String.fromCharCode(i);
        return acc + char;
    }, '');
    return btoa(binary);
}

export async function encryptText(text: string, password: string): Promise<string> {
    try {
        const key = await getKeyFromPassword(password);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const enc = new TextEncoder();
        const encodedText = enc.encode(text);
        
        const encrypted = await crypto.subtle.encrypt(
            { ...algorithm, iv },
            key,
            encodedText
        );

        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);
        
        const result = ENCRYPTION_VERSION_V1 + arrayBufferToBase64(combined.buffer);
        return result;
    } catch (error) {
        console.error('Error in encryptText:', error);
        throw error;
    }
}

export async function decryptText(encryptedText: string, password: string): Promise<string> {
    const version = encryptionVersion(encryptedText);
    switch (version) {
        case 1:
            return await decryptTextV1(encryptedText, password);
        case undefined:
            throw new Error('Text is not encrypted');
        default:
            throw new Error('Unsupported encryption version');
    }
}

async function decryptTextV1(encryptedText: string, password: string): Promise<string> {
    const key = await getKeyFromPassword(password);
    
    // Remove version prefix
    const dataWithoutVersion = encryptedText.substring(ENCRYPTION_VERSION_V1.length);
    
    // Decode the combined data
    const combined = Uint8Array.from(atob(dataWithoutVersion), c => c.charCodeAt(0));
    
    // Extract IV (first 12 bytes) and ciphertext (rest)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
}

export async function makeHash(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    const base64 = btoa(String.fromCharCode(...hashArray));
    return base64
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}