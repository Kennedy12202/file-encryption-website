'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/supabaseClient';
import { downloadAndDecrypt } from '@/lib/upnotaUtils';
import secureLocalStorage from "react-secure-storage";
 

// This component handles the decryption and download of a shared file
export default function ViewSharedFile({ params }) {
    const resolvedParams = use(params);
    const uuid = resolvedParams.uuid;
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState(null);

    
    useEffect(() => {
        const fetchSharedFile = async () => {
            try {
                // Extract key from URL fragment
                const hashParams = new URLSearchParams(window.location.hash.slice(1));
                const keyFromUrl = hashParams.get('key');

                if (!keyFromUrl) {
                    throw new Error('No decryption key found in URL');
                }

                const { data: shareLink, error: fetchError } = await supabase
                    .from('share_links')
                    .select('*')
                    .eq('id', uuid)
                    .single();

                if (fetchError || !shareLink) {
                    throw new Error('Link not found');
                }

                // Store the key temporarily
                const shareKeys = JSON.parse(secureLocalStorage.getItem('shareKeys') || '{}');
                shareKeys[uuid] = keyFromUrl;
                secureLocalStorage.setItem('shareKeys', JSON.stringify(shareKeys));

                // Download and decrypt
                await downloadAndDecrypt(shareLink.file_cid, shareLink.iv, keyFromUrl);

                // Clean up after successful download
                delete shareKeys[uuid];
                secureLocalStorage.setItem('shareKeys', JSON.stringify(shareKeys));

                // Mark as accessed
                await supabase
                    .from('share_links')
                    .delete()
                    .eq('id', uuid);

                setStatus('success');
            } catch (error) {
                console.error('Error:', error);
                setError(error.message);
                setStatus('error');
            }
        };

        fetchSharedFile();
    }, [uuid]);


    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
                {status === 'loading' && (<p> Loading shared file...</p>)}
                {status === 'error' && (<p> Error: {error}</p>)}
                {status === 'success' && (<p> File downloaded successfully! You can close this page. </p> )}
            </div>
        </div>
    );
}