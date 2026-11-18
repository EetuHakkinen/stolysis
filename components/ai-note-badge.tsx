import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

// Tag of a note written by AI, telling also when the user has edited it since.
export function AiNoteBadge({ edited }: { edited: boolean }) {
  const t = useTranslations("Notes");
  return (
    <Badge variant="secondary">
      <SparklesIcon data-icon="inline-start" />
      {edited ? t("aiGeneratedEdited") : t("aiGenerated")}
    </Badge>
  );
}
