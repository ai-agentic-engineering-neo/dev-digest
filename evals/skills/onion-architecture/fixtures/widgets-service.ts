// server/src/modules/widgets/service.ts
import { eq } from 'drizzle-orm';
import { widgets } from '../../db/schema';
import { OpenAIProvider } from '../../adapters/openai-provider';
import type { Container } from '../../platform/container';

// A widget row as inferred from the Drizzle table.
type WidgetRow = typeof widgets.$inferSelect;

export class WidgetService {
  private llm = new OpenAIProvider(process.env.OPENAI_API_KEY!);

  constructor(private container: Container) {}

  // Returns the raw DB rows straight to the caller.
  async listActiveWidgets(minScore: number): Promise<WidgetRow[]> {
    const rows = await this.container.db
      .select()
      .from(widgets)
      .where(eq(widgets.active, true));

    // Business rule lives here, mixed with the query.
    return rows.filter((r) => r.score >= minScore);
  }

  async summarize(id: string): Promise<string> {
    const [row] = await this.container.db
      .select()
      .from(widgets)
      .where(eq(widgets.id, id));
    return this.llm.complete(`Summarize widget: ${row.label}`);
  }
}
