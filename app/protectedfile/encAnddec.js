"use client";
import { supabase } from "@/utils/supabase/supabaseClient";
import { useState, useEffect } from "react";

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;

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
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Download and decryption failed:", error);
        alert("Failed to download and decrypt file: " + error.message);
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
            // Try to get existing key from localStorage
            const storedKeyHex = localStorage.getItem("aesKeyHex");

            if (storedKeyHex) {
                // If key exists, import it
                const key = await importAESKey(storedKeyHex);
                setAesKey(key);
                setAesKeyHex(storedKeyHex);
            } else {
                // If no key exists, generate new one and store it
                const { key, keyHex } = await generateAESKey();
                setAesKey(key);
                setAesKeyHex(keyHex);
                localStorage.setItem("aesKeyHex", keyHex);
            }
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
        <div className="max-h-screen"> 
            <div className="overflow-x-auto">
                <table>
                    <thead>
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium">
                                File Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium">
                                Size
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium">
                                CID
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium">
                                <input
                                    type="file"
                                    onChange={handleUpload}
                                    multiple
                                    className="file:rounded-lg file:border-0 file:text-sm file:font-semibold"
                                    disabled={isUploading}
                                />
                                {isUploading && <span className="text-blue-600 ml-2">Uploading...</span>}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {uploadedFiles.map((file) => (
                            <tr key={file.cid}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium"> 
                                    {file.name}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">
                                    {(file.size/1024).toFixed(1)} KB
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm ">
                                    {file.cid.substring(0, 8)}...
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex gap-4"> 
                                        <button onClick={() => downloadAndDecrypt(file.cid, file.iv, aesKeyHex)}>Download  </button>
                                        <button onClick={() => handleDelete(file.cid)}> Delete </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}