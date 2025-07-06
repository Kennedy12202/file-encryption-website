import { supabase } from "@/utils/supabase/supabaseClient";
import secureLocalStorage from "react-secure-storage";
import { useEffect } from "react";

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;

// Store AES key in secure local storage lalalala
export async function storeAESKey(fileId, keyHex) {
    try {
        const keys = JSON.parse(secureLocalStorage.getItem('aesKeys') || '{}');
        keys[fileId] = keyHex;
        secureLocalStorage.setItem('aesKeys', JSON.stringify(keys));
    } catch (error) {
        console.error('Failed to store AES key:', error);
        throw new Error('Failed to store encryption key');
    }
}

// Get AES key from secure local storage
export async function getStoredAESKey(fileId) {
    try {
        const keys = JSON.parse(secureLocalStorage.getItem('aesKeys') || '{}');
        return keys[fileId];
    } catch (error) {
        console.error('Failed to retrieve AES key:', error);
        return null;
    }
}

// Initialize or retrieve AES key
export async function initializeAESKey(setAesKey, fileId) {
    try {
        const storedKeyHex = await getStoredAESKey(fileId);

        if (storedKeyHex) {
            const key = await importAESKey(storedKeyHex);
            setAesKey(key);
            return;
        }

        // Generate new key if none exists
        const { key, keyHex } = await generateAESKey();
        await storeAESKey(fileId, keyHex);
        setAesKey(key);
    } catch (error) {
        console.error('Failed to initialize AES key:', error);
        throw error;
    }
}

// Initializes AES key on component mount
export const useInitializeAESKey = (setAesKey, fileId) => {
    useEffect(() => {
        initializeAESKey(setAesKey, fileId);
    }, [fileId]); // Dependency on fileId (file ID needs to be passed when fetching key)
};

// Generates a new AES key (if no key exists for the file)
export async function generateAESKey() {
    const key = await  (
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const exportedKey = await crypto.subtle.exportKey("raw", key);
    const keyHex = bufferToHex(exportedKey);
    return { key, keyHex };
}

// Converts buffer to hex (used for storing keys in IndexedDB)
function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

// Imports the AES key from hex (needed for encryption and decryption)
export async function importAESKey(keyHex) {
    const rawKey = new Uint8Array(keyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
}

// Encrypts a file with the provided AES key
export async function encryptFile(file, aesKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const fileBuffer = await file.arrayBuffer();
    const key = aesKey instanceof CryptoKey ? aesKey : await importAESKey(aesKey);

    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        fileBuffer
    );

    return { encryptedData: new Uint8Array(encryptedData), iv: bufferToHex(iv) };
}

// Decrypts the file using the AES key and IV
export async function decryptFile(encryptedData, ivHex, key) {
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    try {
        const decryptedData = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            encryptedData
        );
        return new Blob([decryptedData]);
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Data provided to an operation does not meet requirements");
    }
}

// Uploads encrypted data to Pinata
export async function uploadToPinata(encryptedData, fileName) {
    const formData = new FormData();
    formData.append("file", new Blob([encryptedData]), fileName);

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
        },
        body: formData,
    });

    const responseData = await response.json();
    if (!response.ok) {
        console.error("Pinata Error:", responseData);
        throw new Error(responseData.error?.details || "Failed to upload file to Pinata");
    }
    return responseData.IpfsHash;
}

// Stores file metadata and encrypted details in Supabase
export async function saveToSupabase(cid, iv, fileName, fileSize) {
    const { error: insertError } = await supabase.from("files").insert({
        cid,
        iv,
        file_name: fileName,
        file_size: fileSize,
    });
    if (insertError) {
        throw new Error(`Supabase error: ${insertError.message}`);
    }
}

// Deletes file metadata from Supabase
export async function deleteFile(cid) {
    try {
        const { error } = await supabase
            .from('files')
            .delete()
            .match({ cid });

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Delete failed:', error);
        throw error;
    }
}

// Allows the user to download and decrypt a file from IPFS using the AES key
export async function downloadAndDecrypt(cid, ivHex, keyHex) {
    try {
        let useKeyHex;
        if (keyHex) {
            useKeyHex = keyHex;
        } else {
            useKeyHex = await getStoredAESKey(cid);
        }
        if (!useKeyHex) {
            throw new Error("No encryption key found");
        }

        const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
        if (!response.ok) {
            throw new Error("Failed to fetch file from IPFS");
        }

        const encryptedArrayBuffer = await response.arrayBuffer();
        const encryptedData = new Uint8Array(encryptedArrayBuffer);
        const key = await importAESKey(useKeyHex);
        const decryptedBlob = await decryptFile(encryptedData, ivHex, key);

        // Create a download link for the decrypted file
        const fileName = `decrypted_${cid.substring(0, 6)}`;
        const url = URL.createObjectURL(decryptedBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Download and decryption failed:", error);
        throw error;
    }
}

// Creates a share link for a file
export async function createShareLink(file) {
    try {
        // Set expiration to 30 seconds from now
        const expires_at = new Date(Date.now() + 30 * 1000);

        const { data, error } = await supabase
            .from('share_links')
            .insert({
                file_cid: file.cid,
                iv: file.iv,
                expires_at: expires_at.toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Store the encryption key for this specific share
        const shareKeys = JSON.parse(secureLocalStorage.getItem('shareKeys') || '{}');
        shareKeys[data.id] = file.keyHex; // Store the key directly from the file object
        secureLocalStorage.setItem('shareKeys', JSON.stringify(shareKeys));

        return data.id;
    } catch (error) {
        console.error('Failed to create share link:', error);
        throw error;
    }
}
