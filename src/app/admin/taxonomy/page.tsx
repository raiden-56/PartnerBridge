import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { TaxonomyForm, ToggleActive } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminTaxonomy() {
  await requireAdminPage("taxonomy");
  const admin = createAdminClient();
  const [{ data: industries }, { data: categories }] = await Promise.all([
    admin.from("industries").select("id, name, parent_id, is_active").order("sort_order").order("name"),
    admin.from("partnership_categories").select("id, name, description, is_active").order("sort_order"),
  ]);
  const parents = (industries ?? []).filter((i) => !i.parent_id);
  return (
    <>
      <PageHeader title="Industries & partnership categories" description="Inactive items disappear from forms and filters but remain on existing records." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Industries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TaxonomyForm kind="industry" parents={parents.map((p) => ({ id: p.id, name: p.name }))} />
            <ul className="max-h-[560px] space-y-1 overflow-y-auto">
              {parents.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-50">
                    {p.name} <ToggleActive kind="industry" id={p.id} name={p.name} active={p.is_active} />
                  </div>
                  <ul className="ml-4 border-l border-border pl-3">
                    {(industries ?? [])
                      .filter((c) => c.parent_id === p.id)
                      .map((c) => (
                        <li key={c.id} className="flex items-center justify-between py-1 text-sm text-slate-600">
                          {c.name} <ToggleActive kind="industry" id={c.id} name={c.name} active={c.is_active} />
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Partnership categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TaxonomyForm kind="category" />
            <ul className="divide-y divide-border">
              {(categories ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-xs text-slate-500">{c.description}</span>
                  </span>
                  <ToggleActive kind="category" id={c.id} name={c.name} active={c.is_active} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
