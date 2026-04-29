import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import { expectAffectedRows } from "@/lib/safeMutate";

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
  is_private: boolean;
  profiles: { display_name: string | null } | null;
};

export function useAttachments(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["attachments", tripId];
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [lastExtractedId, setLastExtractedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("*, profiles(display_name)")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false })
        .limit(200);
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
        is_private: (file as any).__isPrivate ?? false,
      });
      if (insertError) throw insertError;

      return { id: attachmentId, filePath: storagePath, fileType: file.type };
    },
    onSuccess: (data) => {
      trackEvent("attachment_uploaded", { trip_id: tripId, file_type: data?.fileType }, user?.id);
      qc.invalidateQueries({ queryKey: key });
      toast.success("File uploaded");

      // Fire-and-forget AI extraction
      if (data?.id && data?.filePath && data?.fileType) {
        setExtractingIds((prev) => new Set(prev).add(data.id));
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
            trackEvent("ai_booking_extract", { success: true }, user?.id);
            setLastExtractedId(data.id);
          })
          .catch(() => {
            trackEvent("ai_booking_extract", { success: false }, user?.id);
          })
          .finally(() => {
            setExtractingIds((prev) => {
              const next = new Set(prev);
              next.delete(data.id);
              return next;
            });
          });
      }
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e, "Failed to upload file")),
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
      trackEvent("attachment_link_added", { trip_id: tripId }, user?.id);
      qc.invalidateQueries({ queryKey: key });
      toast.success("Link saved");
      if (data?.id && data?.url) {
        setFetchingIds((prev) => new Set(prev).add(data.id));
        supabase.functions.invoke("fetch-link-preview", {
          body: { attachment_id: data.id, url: data.url },
        }).then(() => {
          qc.invalidateQueries({ queryKey: key });
        }).catch(() => {}).finally(() => {
          setFetchingIds((prev) => {
            const next = new Set(prev);
            next.delete(data.id);
            return next;
          });
        });
      }
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e, "Failed to add link")),
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: AttachmentRow) => {
      if (attachment.file_path) {
        await supabase.storage
          .from("trip-attachments")
          .remove([attachment.file_path]);
      }
      expectAffectedRows(
        await supabase
          .from("attachments")
          .delete()
          .eq("id", attachment.id)
          .select("id"),
        "This item could not be deleted. Please refresh and try again.",
      );
    },
    onSuccess: (_data, attachment) => {
      qc.setQueryData<AttachmentRow[]>(key, (old) =>
        old?.filter((a) => a.id !== attachment.id)
      );
      qc.invalidateQueries({ queryKey: key });
      trackEvent("attachment_deleted", { trip_id: tripId, type: attachment.type }, user?.id);
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e, "Failed to delete")),
  });

  const getSignedUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("trip-attachments")
      .createSignedUrl(filePath, 60);
    if (error) throw error;
    return data.signedUrl;
  };

  const addManual = useMutation({
    mutationFn: async (params: { title: string; type: string; notes?: string; is_private?: boolean }) => {
      const { error } = await supabase.from("attachments").insert({
        trip_id: tripId,
        title: params.title,
        type: params.type,
        notes: params.notes || null,
        created_by: user!.id,
        is_private: params.is_private ?? false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Booking added");
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e, "Failed to add booking")),
  });

  const updateNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      expectAffectedRows(
        await supabase
          .from("attachments")
          .update({ notes: notes || null })
          .eq("id", id)
          .select("id"),
        "Notes could not be saved. Please refresh and try again.",
      );
    },
    onSuccess: (_data, vars) => {
      qc.setQueryData<AttachmentRow[]>(key, (old) =>
        old?.map((a) => a.id === vars.id ? { ...a, notes: vars.notes || null } : a)
      );
      qc.invalidateQueries({ queryKey: key });
      toast.success("Notes saved");
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e, "Failed to save notes")),
  });

  const updatePrivacy = useMutation({
    mutationFn: async ({ id, is_private }: { id: string; is_private: boolean }) => {
      expectAffectedRows(
        await supabase
          .from("attachments")
          .update({ is_private })
          .eq("id", id)
          .select("id"),
        "Privacy could not be updated. Please refresh and try again.",
      );
    },
    onSuccess: (_data, vars) => {
      qc.setQueryData<AttachmentRow[]>(key, (old) =>
        old?.map((a) => a.id === vars.id ? { ...a, is_private: vars.is_private } : a)
      );
      qc.invalidateQueries({ queryKey: key });
      toast.success(vars.is_private ? "Set to private" : "Set to shared");
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e, "Failed to update privacy")),
  });

  const updateType = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      expectAffectedRows(
        await supabase
          .from("attachments")
          .update({ type })
          .eq("id", id)
          .select("id"),
        "Category could not be updated. Please refresh and try again.",
      );
    },
    onSuccess: (_data, vars) => {
      qc.setQueryData<AttachmentRow[]>(key, (old) =>
        old?.map((a) => a.id === vars.id ? { ...a, type: vars.type } : a)
      );
      qc.invalidateQueries({ queryKey: key });
      toast.success("Category updated");
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e, "Failed to update category")),
  });

  const clearLastExtractedId = () => setLastExtractedId(null);

  return { query, uploadFile, addLink, addManual, deleteAttachment, updateNotes, updatePrivacy, updateType, getSignedUrl, extractingIds, fetchingIds, lastExtractedId, clearLastExtractedId };
}
