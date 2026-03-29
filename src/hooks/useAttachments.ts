import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type AttachmentRow = {
  id: string;
  trip_id: string;
  itinerary_item_id: string | null;
  created_at: string;
  title: string;
  notes: string | null;
  type: string;
  file_path: string | null;
  url: string | null;
  created_by: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  booking_data: Record<string, unknown> | null;
  profiles: { display_name: string | null } | null;
};

export function useAttachments(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["attachments", tripId];
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("*, profiles(display_name)")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AttachmentRow[];
    },
    enabled: !!tripId && !!user,
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const attachmentId = crypto.randomUUID();
      const storagePath = `trips/${tripId}/${attachmentId}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("trip-attachments")
        .upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("attachments").insert({
        id: attachmentId,
        trip_id: tripId,
        file_path: storagePath,
        title: file.name,
        type: "other",
        created_by: user!.id,
      });
      if (insertError) throw insertError;

      return { id: attachmentId, filePath: storagePath, fileType: file.type };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("File uploaded");

      // Fire-and-forget AI extraction
      if (data?.id && data?.filePath && data?.fileType) {
        supabase.functions
          .invoke("extract-booking-info", {
            body: {
              attachment_id: data.id,
              file_path: data.filePath,
              file_type: data.fileType,
            },
          })
          .then(() => {
            qc.invalidateQueries({ queryKey: key });
          })
          .catch(() => {});
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLink = useMutation({
    mutationFn: async (params: {
      url: string;
      title: string;
      type: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.from("attachments").insert({
        trip_id: tripId,
        url: params.url,
        title: params.title,
        type: params.type,
        notes: params.notes || null,
        created_by: user!.id,
      }).select("id").single();
      if (error) throw error;
      return { id: data.id, url: params.url };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Link saved");
      if (data?.id && data?.url) {
        supabase.functions.invoke("fetch-link-preview", {
          body: { attachment_id: data.id, url: data.url },
        }).then(() => {
          qc.invalidateQueries({ queryKey: key });
        }).catch(() => {});
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: AttachmentRow) => {
      if (attachment.file_path) {
        await supabase.storage
          .from("trip-attachments")
          .remove([attachment.file_path]);
      }
      const { error } = await supabase
        .from("attachments")
        .delete()
        .eq("id", attachment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getSignedUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("trip-attachments")
      .createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  };

  return { query, uploadFile, addLink, deleteAttachment, getSignedUrl };
}
