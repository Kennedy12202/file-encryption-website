import { supabase } from "@/utils/supabase/supabaseClient";
import { useEffect } from "react";


const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;


// initializes IndexedDB for storing the AES keys
export async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("fileStorage", 4);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("aesKeys")) {
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

// retrieves an existing AES key or generates a new one and stores it in IndexedDB
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


// stores the AES key in IndexedDB for a specific file (using fileId)
export async function indexStoreAESKeys(db, fileId, keyHex) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("aesKeys", "readwrite");
        const store = transaction.objectStore("aesKeys");
        const addRequest = store.put({ id: fileId, keyHex }); 
        addRequest.onsuccess = () => {
            resolve();
        };
        addRequest.onerror = (event) => {
            reject(event.target.error);
        };
    });
}


// initializes AES key on component mount
export const useInitializeAESKey = (setAesKey, fileId) => {
    useEffect(() => {
        initializeAESKey(setAesKey, fileId);
    }, [fileId]); // Dependency on fileId (file ID needs to be passed when fetching key)
};

// generates a new AES key (if no key exists for the file)
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


// converts buffer to hex (used for storing keys in IndexedDB)
function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}


// imports the AES key from hex (needed for encryption and decryption)
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


// encrypts a file with the provided AES key
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


// decrypts the file using the AES key and IV
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


// uploads encrypted data to Pinata
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


// stores file metadata and encrypted details in Supabase
export async function saveToSupabase(cid, iv, fileName, fileSize, mimeType) {
    const { error: insertError } = await supabase.from("files").insert({
        cid,
        iv,
        file_name: fileName,
        file_size: fileSize,
        mimeType
    });
    if (insertError) {
        throw new Error(`Supabase error: ${insertError.message}`);
    }
}


// deletes file metadata from Supabase
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


// allows the user to download and decrypt a file from IPFS using the AES key
export async function downloadAndDecrypt(cid, ivHex, keyHex) {
    try {
        let aesKey;

        // cautious check for keyHex type
        if (keyHex) {
            if (keyHex instanceof CryptoKey) {
                aesKey = keyHex;
            } else if (typeof keyHex === "string") {
                aesKey = await importAESKey(keyHex);
            } else {
                throw new Error("Invalid key format passed to downloadAndDecrypt");
            }
        } else {
            // load AES key from IndexedDB if keyHex is not provided
            const db = await initIndexedDB();
            const transaction = db.transaction("aesKeys", "readonly");
            const store = transaction.objectStore("aesKeys");
            const getRequest = store.get(cid);

            const storedKey = await new Promise((resolve, reject) => {
                getRequest.onsuccess = () => {
                    resolve(getRequest.result?.keyHex); 
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

        // fetch encrypted file from IPFS
        const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
        if (!response.ok) {
            throw new Error("Failed to fetch file from IPFS");
        }

        const encryptedArrayBuffer = await response.arrayBuffer();
        const encryptedData = new Uint8Array(encryptedArrayBuffer);

        // decrypt the file
        const decryptedBlob = await decryptFile(encryptedData, ivHex, aesKey);

        // create download link
        const fileName = `decrypted_${cid.substring(0, 6)}`;
        const url = URL.createObjectURL(decryptedBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // revoke object URL after download
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Download and decryption failed:", error);
        alert("Failed to download and decrypt file: " + error.message);
    }
}


export async function getKeyHexFromIndexedDB(fileId) {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("aesKeys", "readonly");
        const store = transaction.objectStore("aesKeys");
        const getRequest = store.get(fileId);

        getRequest.onsuccess = () => {
            if (getRequest.result?.keyHex) {
                resolve(getRequest.result.keyHex);
            } else {
                console.warn("Key not found for:", fileId);
                resolve(null);
            }
        };

        getRequest.onerror = (event) => {
            console.error("IndexedDB get error:", event.target.error);
            reject(event.target.error);
        };
    });
}
