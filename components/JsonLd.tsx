/**
 * One schema.org graph as a script tag.
 *
 * Rendered in the body, which is what Next recommends over a hand-written
 * <head>. `<` becomes < because JSON.stringify does not sanitise, and a
 * "</script>" inside any string would close the tag early and put the rest of
 * the graph on the page as text.
 */
export default function JsonLd({ schema }: { schema: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
    />
  );
}
