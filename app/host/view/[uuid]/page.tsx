import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'

interface ViewFileParams {
  params: {
    uuid: string;
  };
}


export default async function ViewFile({ params }: ViewFileParams) {
  const supabase = createClient()
  const uuid = params.uuid


  // Fetch the link info
  const { data, error } = await (await supabase)
    .from('links')
    .select('*')
    .eq('id', uuid)
    .single()

  if (error || !data || data.accessed) {
    return notFound() // or custom 404 or "already used" page
  }


  // Mark as accessed
  await (await supabase)
    .from('links')
    .update({ accessed: true })
    .eq('id', uuid)

  // Now retrieve the file (e.g., from IPFS)
  const fileCID = data.pointer

  return (
    <div>
      <h1>Your File</h1>
      <a href={`https://gateway.pinata.cloud/ipfs/${fileCID}`} target="_blank" rel="noopener noreferrer">
        Download/View
      </a>
    </div>
  )
}
