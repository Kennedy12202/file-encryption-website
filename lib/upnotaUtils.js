import { supabase } from "@/utils/supabase/supabaseClient";
import { useEffect } from "react";

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;

// Initializes IndexedDB for storing the AES keys
export async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("fileStorage", 4);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("aesKeys")) {
                // Store AES keys associated with each file by unique ID
                db.createObjectStore("aesKeys", { keyPath: "id" });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Retrieves an existing AES key or generates a new one and stores it in IndexedDB
export async function initializeAESKey(setAesKey, fileId) {
    const db = await initIndexedDB();
    const transaction = db.transaction("aesKeys", "readonly");
    const store = transaction.objectStore("aesKeys");
    const getRequest = store.get(fileId); // Fetch key by fileId (CID or unique identifier)

    return new Promise((resolve) => {
        getRequest.onsuccess = async () => {
            const storedKey = getRequest.result;
            if (storedKey && storedKey.keyHex) {
                const keyHex = storedKey.keyHex;
                const key = await importAESKey(keyHex);
                setAesKey(key);
                resolve();
            } else {
                console.log("No AES key found for file in IndexedDB. Generating new key...");
                const { key, keyHex } = await generateAESKey();
                await indexStoreAESKeys(db, fileId, keyHex); // Store key by fileId
                setAesKey(key);
                resolve();
            }
        };

        getRequest.onerror = () => {
            console.error("Failed to retrieve AES key from IndexedDB.");
            resolve();
        };
    });
}


// Stores the AES key in IndexedDB for a specific file (using fileId)
export async function indexStoreAESKeys(db, fileId, keyHex) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("aesKeys", "readwrite");
        const store = transaction.objectStore("aesKeys");
        const addRequest = store.put({ id: fileId, keyHex }); // Associate the key with fileId (CID)
        addRequest.onsuccess = () => {
            resolve();
        };
        addRequest.onerror = (event) => {
            reject(event.target.error);
        };
    });
}


// Initializes AES key on component mount
export const useInitializeAESKey = (setAesKey, fileId) => {
    useEffect(() => {
        initializeAESKey(setAesKey, fileId);
    }, [fileId]); // Dependency on fileId (file ID needs to be passed when fetching key)
};

// Generates a new AES key (if no key exists for the file)
export async function generateAESKey() {
    const key = await crypto.subtle.generateKey(
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
        let aesKey;

        // Cautious check for keyHex type
        if (keyHex) {
            if (keyHex instanceof CryptoKey) {
                aesKey = keyHex;
            } else if (typeof keyHex === "string") {
                aesKey = await importAESKey(keyHex);
            } else {
                throw new Error("Invalid key format passed to downloadAndDecrypt");
            }
        } else {
            // Load AES key from IndexedDB if keyHex is not provided
            const db = await initIndexedDB();
            const transaction = db.transaction("aesKeys", "readonly");
            const store = transaction.objectStore("aesKeys");
            const getRequest = store.get(cid); // Get the key by CID (fileId)

            const storedKey = await new Promise((resolve, reject) => {
                getRequest.onsuccess = () => {
                    resolve(getRequest.result?.keyHex); // Return keyHex if found
                };
                getRequest.onerror = () => {
                    reject(new Error("Failed to access IndexedDB"));
                };
            });

            if (storedKey) {
                aesKey = await importAESKey(storedKey);
            } else {
                throw new Error("No AES key found in IndexedDB");
            }
        }

        // Fetch encrypted file from IPFS
        const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
        if (!response.ok) {
            throw new Error("Failed to fetch file from IPFS");
        }

        const encryptedArrayBuffer = await response.arrayBuffer();
        const encryptedData = new Uint8Array(encryptedArrayBuffer);

        // Decrypt the file
        const decryptedBlob = await decryptFile(encryptedData, ivHex, aesKey);

        // Create download link
        const fileName = `decrypted_${cid.substring(0, 6)}`;
        const url = URL.createObjectURL(decryptedBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Revoke object URL after download
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Download and decryption failed:", error);
        alert("Failed to download and decrypt file: " + error.message);
    }
}


