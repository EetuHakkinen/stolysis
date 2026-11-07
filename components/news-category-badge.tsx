import { Badge } from "@/components/ui/badge";

// Category of a news item as a tag.
export function NewsCategoryBadge({ category }: { category: { name: string } }) {
  return <Badge variant="outline">{category.name}</Badge>;
}
