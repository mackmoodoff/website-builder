import { z } from "zod";

export const storePlanSchema = z.object({
  businessName: z.string(),
  tagline: z.string(),
  brandDescription: z.string(),
  navigation: z.array(z.string()).min(2).max(6),
  homepage: z.object({
    heroHeading: z.string(),
    heroSubheading: z.string(),
    sections: z
      .array(
        z.object({
          heading: z.string(),
          body: z.string(),
        }),
      )
      .min(2)
      .max(5),
  }),
  pages: z
    .array(
      z.object({
        title: z.string(),
        handle: z.string(),
        bodyHtml: z.string(),
      }),
    )
    .min(2)
    .max(6),
  products: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        priceRange: z.string(),
        tags: z.array(z.string()).max(5),
      }),
    )
    .min(3)
    .max(12),
});

export type StorePlan = z.infer<typeof storePlanSchema>;
