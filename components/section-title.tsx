// Title of a section within a page or tab, such as a table or a graph; a figure's title is its
// figcaption.
export function SectionTitle({ as: Tag = "h3", children }: { as?: "h3" | "figcaption"; children: React.ReactNode }) {
  return <Tag className="text-lg font-semibold">{children}</Tag>;
}
