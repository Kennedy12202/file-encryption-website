"use client";
import { supabase } from "@/utils/supabase/supabaseClient";
import { useState, useEffect } from "react";

const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI1NWE0NjMzZC05MWMxLTQ5OTEtODRjOC02YzE0Mjk2NzI1NTgiLCJlbWFpbCI6Imtlbm5lZHkxMjIwMkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiN2M1ZDRmNDg5YWYzZWM3YWYzZmIiLCJzY29wZWRLZXlTZWNyZXQiOiIxNGFjNTk4Zjk0M2JjNWNlNmJlMTcyNzk3ZDc4NWIxMzRiNTQ0NzRlMmQ1ZTk5ZmIwNWY3MjIzMThkNGM5MzY2IiwiZXhwIjoxNzc0OTQwNTI0fQ.9xDDwZl4KEGKKFX-96tcIduuysair15COUtmxSHqw9s";

//generate AES keys instead of leaving them user-generated (prepare to defend)
async function generateAESKey() {
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
function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

async function importAESKey(keyHex) {
    const rawKey = new Uint8Array(keyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encryptFile(file, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const fileBuffer = await file.arrayBuffer();
    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        fileBuffer
    );
    return { encryptedData: new Uint8Array(encryptedData), iv: bufferToHex(iv) };
}

//review this function (iv hex sliced into chunks of 2 bytes then converted to int)
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
async function uploadToPinata(encryptedData, fileName) {
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
async function saveToSupabase(cid, keyHex, iv, fileName, fileSize) {
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
async function deleteFile(cid) {
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
async function downloadAndDecrypt(cid, ivHex, keyHex) {
    try {
        const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
        if (!response.ok) {
            throw new Error("Failed to fetch file from IPFS");
        }
        const encryptedArrayBuffer = await response.arrayBuffer();
        const encryptedData = new Uint8Array(encryptedArrayBuffer);

        const key = await importAESKey(keyHex);
        const decryptedBlob = await decryptFile(encryptedData, ivHex, key);

        const url = URL.createObjectURL(decryptedBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "decrypted_file";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (error) {
        console.error("Download and decryption failed:", error);
        alert("Failed to download and decrypt file");
    }
}


export default function FileUploader() {
    const [aesKey, setAesKey] = useState(null);
    const [aesKeyHex, setAesKeyHex] = useState("");
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);

    //ensures persistence of uploaded files
    //when the component mounts, it retrieves the uploaded files from localStorage
    useEffect(() => {
        const storedFiles = localStorage.getItem("uploadedFiles");
        if (storedFiles) {
            setUploadedFiles(JSON.parse(storedFiles));
        }
    }, []);

    useEffect(() => {
        if (uploadedFiles.length > 0) {
            localStorage.setItem("uploadedFiles", JSON.stringify(uploadedFiles));
        }
    }, [uploadedFiles]);

    useEffect(() => {
        (async () => {
            const { key, keyHex } = await generateAESKey();
            setAesKey(key);
            setAesKeyHex(keyHex);
        })();
    }, []);

    //handles the file upload process
    //when a file is selected, it encrypts the file using the AES key, uploads it to Pinata, and saves the metadata to Supabase
    const handleUpload = async (event) => {
        try {
            setIsUploading(true);
            const files = Array.from(event.target.files);
            if (!files.length) {
                alert("Please select at least one file.");
                return;
            }
            const results = await Promise.all(
                files.map(async (file) => {
                    const { encryptedData, iv } = await encryptFile(file, aesKey);
                    const cid = await uploadToPinata(encryptedData, file.name);
                    await saveToSupabase(cid, aesKeyHex, iv, file.name, file.size);
                    return { name: file.name, cid, size: file.size, iv };
                })
            );
            setUploadedFiles((prev) => [...prev, ...results]);
        } catch (error) {
            console.error("Upload failed:", error);
            alert(error.message || "Failed to upload some files");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (cid) => {
        try {
            await deleteFile(cid);
            setUploadedFiles(files => files.filter(file => file.cid !== cid));
            localStorage.setItem('uploadedFiles',
                JSON.stringify(uploadedFiles.filter(file => file.cid !== cid))
            );
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete file');
        }
    };

    //brower-side rendering
    return (
        <div className="p-4">
            <h2 className="text-xl font-semibold mb-4">Upload Files</h2>
            <input
                type="file"
                onChange={handleUpload}
                multiple
                className="mb-4"
                disabled={isUploading}
            />

            {uploadedFiles.length > 0 && (
                <ul className="space-y-2">
                    {uploadedFiles.map((file) => (
                        <li key={file.cid} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <span>{file.name}</span>
                            <div className="space-x-2">
                                <button onClick={() => downloadAndDecrypt(file.cid, file.iv, aesKeyHex)} > Download & Decrypt </button>
                                <button onClick={() => handleDelete(file.cid)}> Delete </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}