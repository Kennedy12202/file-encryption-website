"use client";
import { useState, useEffect } from "react";
import { uploadToPinata, encryptFile, importAESKey, generateAESKey, saveToSupabase, downloadAndDecrypt, deleteFile } from "@/lib/upnotaUtils";


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
                                    {(file.size / 1024).toFixed(1)} KB
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