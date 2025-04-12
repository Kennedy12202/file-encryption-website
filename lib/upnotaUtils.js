import { supabase } from "@/utils/supabase/supabaseClient";

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;
//generate AES keys instead of leaving them user-generated (prepare to defend)
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
//convert buffer to hex (aiding in later encryption as encrypted data is in hex)
export function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

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

export async function encryptFile(file, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); 
    const fileBuffer = await file.arrayBuffer();
    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        fileBuffer
    );
    return { encryptedData: new Uint8Array(encryptedData), iv: bufferToHex(iv) };
}

// iv hex sliced into chunks of 2 bytes then converted to int
//decrypts the file using the AES key and iv
async function decryptFile(encryptedData, ivHex, key) {
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))); 
    try {
        const decryptedData = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            encryptedData
        );
        return new Blob([decryptedData]); //Blob (Binary Large Object) ~ represents chunks of binary data
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Data provided to an operation does not meet requirements");
    }
}
//upload to pinata
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
//stores cid, key, iv, file, and file size in supabase
//standard insertion
export async function saveToSupabase(cid, keyHex, iv, fileName, fileSize) {
    const { error: insertError } = await supabase.from("files").insert({
        cid,
        encryption_key: keyHex,
        iv,
        file_name: fileName,
        file_size: fileSize,
    });
    if (insertError) {
        throw new Error(`Supabase error: ${insertError.message}`);
    }
}

//delete file from Supabase
export async function deleteFile(cid) {
    try {
        // Delete from Supabase
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

//allows the user to download the file from IPFS and decrypt it using the AES key 
export async function downloadAndDecrypt(cid, ivHex, keyHex) {
    try {
        // Get the key from localStorage if not provided
        const useKeyHex = keyHex || localStorage.getItem("aesKeyHex");
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

        // Use original filename if available
        const fileName = `decrypted_${cid.substring(0, 6)}`;

        const url = URL.createObjectURL(decryptedBlob);
        const link = document.createElement("link");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Download and decryption failed:", error);
        alert("Failed to download and decrypt file: " + error.message);
    }
}