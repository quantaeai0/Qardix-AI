import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

export function ConfirmToggle({ active, name, onConfirm, warning }: { active: boolean; name: string; onConfirm: () => unknown; warning?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Switch checked={active} onCheckedChange={() => setOpen(true)} aria-label={`Toggle ${name}`} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{active ? "Deactivate" : "Activate"} {name}?</AlertDialogTitle>
            <AlertDialogDescription>{active ? warning ?? "This account will lose access immediately." : "Access will be restored immediately."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onConfirm()}>{active ? "Deactivate" : "Activate"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
