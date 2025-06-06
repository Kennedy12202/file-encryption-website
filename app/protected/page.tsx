import { createClient } from "@/utils/supabase/server";
import FileUploader from "@/app/protectedfile/encAnddec.js"
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  return (
    <FileUploader/>

 
  );
}
