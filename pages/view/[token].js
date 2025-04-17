import { supabase } from "@/utils/supabase/supabaseClient";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { decryptFile } from "@/lib/upnotaUtils";

export default function ViewFile() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState('Loading...');
  const [fileBlobUrl, setFileBlobUrl] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);

  useEffect(() => {
    if (!token) return;

    const viewFile = async () => {
      setStatus("Validating link...");

      const { data, error } = await supabase
        .from("files")
        .select("*")
        .eq("one_time_token", token)
        .single();

      if (error || !data) {
        setStatus("Invalid or expired link.");
        return;
      }

      const { token_used, token_expires_at, cid, file_name: fileName, mimeType, iv } = data;

      if (token_used) {
        setStatus("This link has already been used.");
        return;
      }

      const now = new Date();
      const expires = new Date(token_expires_at);
      if (now > expires) {
        setStatus("This link has expired.");
        return;
      }

      try {
        setStatus("Decrypting file...");

        // get AES key from URL fragment
        const hash = window.location.hash;
        const aesKeyFromUrl = new URLSearchParams(hash.slice(1)).get("key");
        if (!aesKeyFromUrl) {
          setStatus("Missing encryption key in link.");
          return;
        }

        // decode the AES key from base64
        const aesKeyBuffer = Uint8Array.from(atob(aesKeyFromUrl), c => c.charCodeAt(0));
        const aesKey = await window.crypto.subtle.importKey(
          "raw",
          aesKeyBuffer,
          "AES-GCM",
          false,
          ["decrypt"]
        );

        const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
        if (!response.ok) throw new Error("Failed to fetch file from IPFS");

        const encryptedArrayBuffer = await response.arrayBuffer();
        const encryptedData = new Uint8Array(encryptedArrayBuffer);
        const decryptedBlob = await decryptFile(encryptedData, iv, aesKey);

        const blobUrl = URL.createObjectURL(decryptedBlob);
        setFileBlobUrl(blobUrl);
        setFileMeta({ fileName, mimeType });

        // revoke URL after 15 minutes
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          setFileBlobUrl(null);
          setStatus("This preview link has expired.");
        }, 15 * 60 * 1000); // 15 minutes

        // invalidate token in DB after 15 minutes
        setTimeout(async () => {
          await supabase
            .from("files")
            .update({ token_used: true })
            .eq("one_time_token", token);
        }, 15 * 60 * 1000);

        setStatus(null);
      } catch (err) {
        console.error("Error decrypting file", err);
        setStatus("Decryption failed. Please try from the device that uploaded the file.");
      }
    };

    viewFile();
  }, [token]);

  if (status) return <span className="p-4 text-lg">{status}</span>;

  if (fileBlobUrl && fileMeta?.mimeType) {
    const mimeType = fileMeta.mimeType;
    const isImage = mimeType.startsWith("image/");
    const isVideo = mimeType.startsWith("video/");
    const isPDF = mimeType === "application/pdf";

    return (
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-semibold">Shared File: {fileMeta.fileName}</h1>

        {isImage && <img src={fileBlobUrl} alt="Shared file" className="max-w-full rounded shadow" />}
        {isVideo && <video controls src={fileBlobUrl} className="w-full rounded shadow" />}
        {isPDF && <iframe src={fileBlobUrl} className="w-full h-[80vh] rounded shadow" />}
        {!isImage && !isVideo && !isPDF && (
          <a
            href={fileBlobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
          >
            Open File in New Tab
          </a>
        )}
      </div>
    );
  }

  return null;
}
