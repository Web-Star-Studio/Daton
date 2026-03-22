# Daton Design Language Specification

> Definitive reference for the Daton web application design system.
> Built on React 19, Tailwind CSS 4, and shadcn/ui (new-york preset) with Radix UI primitives.
> Aesthetic: Apple Human Interface Guidelines-inspired — clean, minimal, light.

---

## Table of Contents

1. [Foundation (Design Tokens)](#1-foundation-design-tokens)
2. [UI Components](#2-ui-components)
3. [Animations & Transitions](#3-animations--transitions)
4. [UX Patterns & Guidelines](#4-ux-patterns--guidelines)
5. [Accessibility](#5-accessibility)
6. [Icons](#6-icons)
7. [Dark Mode Specification (Future)](#7-dark-mode-specification-future)
8. [Tech Stack Reference](#8-tech-stack-reference)

---

## 1. Foundation (Design Tokens)

All tokens are defined as CSS custom properties using HSL values in `src/index.css`.

### 1.1 Colors

#### Primary Palette

| Token | HSL Value | Hex Approx. | Usage |
|-------|-----------|-------------|-------|
| `--primary` | `211 100% 50%` | `#007AFF` | Buttons, links, active states, focus rings |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary backgrounds |
| Primary Hover | — | `#0066DD` | Button hover state (hardcoded) |

#### Semantic Colors

| Token | HSL Value | Usage |
|-------|-----------|-------|
| `--destructive` | `0 84% 60%` | Errors, delete actions, danger alerts |
| `--destructive-foreground` | `0 0% 100%` | Text on destructive backgrounds |
| Success (Tailwind) | `emerald-500/600` | Success badges, positive states |
| Warning (Tailwind) | `amber-500/600` | Warning badges, caution states |

#### Neutral Palette

| Token | HSL Value | Hex Approx. | Usage |
|-------|-----------|-------------|-------|
| `--background` | `0 0% 98%` | `#FAFAFA` | Page background |
| `--foreground` | `240 10% 10%` | `#18181B` | Primary text |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card backgrounds |
| `--card-foreground` | `240 10% 10%` | `#18181B` | Card text |
| `--secondary` | `240 5% 96%` | `#F4F4F5` | Secondary buttons, subtle backgrounds |
| `--secondary-foreground` | `240 10% 15%` | `#262630` | Text on secondary |
| `--muted` | `240 5% 96%` | `#F4F4F5` | Muted backgrounds |
| `--muted-foreground` | `240 4% 46%` | `#71717A` | Secondary/helper text |
| `--accent` | `211 100% 95%` | `#E6F2FF` | Accent backgrounds (light blue) |
| `--accent-foreground` | `211 100% 40%` | `#0052CC` | Accent text |
| `--border` | `240 6% 90%` | `#E4E4E7` | Borders, dividers |
| `--input` | `240 6% 90%` | `#E4E4E7` | Input borders |
| `--ring` | `211 100% 50%` | `#007AFF` | Focus rings |

#### Sidebar Tokens

| Token | HSL Value | Usage |
|-------|-----------|-------|
| `--sidebar` | `0 0% 100%` | Sidebar background |
| `--sidebar-foreground` | `240 10% 15%` | Sidebar text |
| `--sidebar-border` | `240 6% 90%` | Sidebar borders |
| `--sidebar-accent` | `240 5% 96%` | Sidebar active item bg |
| `--sidebar-accent-foreground` | `240 10% 10%` | Sidebar active item text |

#### CSS Variables Definition

```css
:root {
  --background: 0 0% 98%;
  --foreground: 240 10% 10%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 10%;
  --border: 240 6% 90%;
  --input: 240 6% 90%;
  --ring: 211 100% 50%;
  --primary: 211 100% 50%;
  --primary-foreground: 0 0% 100%;
  --secondary: 240 5% 96%;
  --secondary-foreground: 240 10% 15%;
  --muted: 240 5% 96%;
  --muted-foreground: 240 4% 46%;
  --accent: 211 100% 95%;
  --accent-foreground: 211 100% 40%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --sidebar: 0 0% 100%;
  --sidebar-foreground: 240 10% 15%;
  --sidebar-border: 240 6% 90%;
  --sidebar-accent: 240 5% 96%;
  --sidebar-accent-foreground: 240 10% 10%;
  --radius: 0.75rem;
}
```

### 1.2 Typography

#### Font Family

- **Primary Font:** Inter (Google Fonts)
- **Weights:** 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)
- **CSS Variable:** `--font-sans: 'Inter', sans-serif`

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

#### Type Scale

| Name | Class | Size | Usage |
|------|-------|------|-------|
| Tiny | `text-[11px]` | 11px | Step badges, dialog step indicators |
| Extra Small | `text-xs` | 12px | Labels, badges, form descriptions |
| Small UI | `text-[13px]` | 13px | Buttons, tab triggers, menu items |
| Body | `text-sm` | 14px | Body text, table cells, form inputs |
| Dialog Title | `text-[15px]` | 15px | Dialog headings |
| Base | `text-base` | 16px | Default body (rarely used explicitly) |
| Card Title | `text-xl` | 20px | Card titles, section headings |

#### Heading Styles

All headings (`h1`–`h6`) share these base styles:

```css
h1, h2, h3, h4, h5, h6 {
  font-weight: 600;        /* font-semibold */
  letter-spacing: -0.025em; /* tracking-tight */
  color: var(--foreground);
}
```

#### Body Styles

```css
body {
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

### 1.3 Spacing

Based on Tailwind CSS 4px base grid:

| Token | Value | Common Usage |
|-------|-------|--------------|
| `space-y-1.5` | 6px | Form field internal spacing |
| `gap-2` | 8px | Icon + text gaps, button groups |
| `gap-3` | 12px | Field group gaps |
| `gap-4` | 16px | Section spacing, card grids |
| `gap-6` | 24px | Major section spacing, card padding |
| `gap-7` | 28px | Field group vertical spacing |
| `p-6` | 24px | Card padding, dialog content padding |
| `px-4 py-2` | 16px / 8px | Default button padding |

### 1.4 Border Radius

| Token | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| `--radius` | Base | 12px (0.75rem) | Reference value |
| `rounded-sm` | `--radius-sm` | 8px | Checkboxes, small elements |
| `rounded-md` | `--radius-md` | 10px | Inputs, dropdown items |
| `rounded-lg` | `--radius-lg` | 12px | Buttons, popover content |
| `rounded-xl` | `--radius-xl` | 16px | Large containers |
| `rounded-2xl` | `--radius-2xl` | 20px | Cards, dialogs |
| `rounded-full` | — | 9999px | Badges, avatars, toggle thumbs |

### 1.5 Shadows

| Class | Usage |
|-------|-------|
| `shadow-sm` | Cards, subtle elevation |
| `shadow-md` | Popovers, dropdowns |
| `shadow-lg` | Sheets, drawers, toasts |
| `shadow-xl` | Dialogs, modals |

### 1.6 Breakpoints

| Name | Width | Tailwind Prefix | Usage |
|------|-------|----------------|-------|
| Mobile | 768px | — | `useIsMobile()` hook threshold |
| sm | 640px | `sm:` | Small devices |
| md | 768px | `md:` | Tablets, sidebar visibility |
| lg | 1024px | `lg:` | Desktops |
| xl | 1280px | `xl:` | Large screens, grid columns |
| 2xl | 1536px | `2xl:` | Extra large screens |

---

## 2. UI Components

All components are located in `src/components/ui/`. They use `cn()` from `src/lib/utils.ts` for class merging (clsx + tailwind-merge).

### 2.1 Button

> `src/components/ui/button.tsx`

Primary interactive element. Features micro-interaction with `active:scale-[0.97]`.

#### Variants

| Variant | Appearance |
|---------|------------|
| `default` | Solid blue (`#007AFF`), white text, hover `#0066DD` |
| `secondary` | White bg, border, gray text, hover `gray-50` |
| `outline` | Same as secondary (white bg, border) |
| `ghost` | Transparent, muted text, hover secondary bg |
| `destructive` | Solid red, white text |
| `link` | Blue text, underline on hover |

#### Sizes

| Size | Height | Padding |
|------|--------|---------|
| `default` | h-9 (36px) | px-4 py-2 |
| `sm` | h-8 (32px) | px-3, text-xs |
| `lg` | h-11 (44px) | px-6 |
| `icon` | h-9 w-9 (36x36px) | — |

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"default" \| "secondary" \| "outline" \| "ghost" \| "destructive" \| "link"` | `"default"` | Visual style |
| `size` | `"default" \| "sm" \| "lg" \| "icon"` | `"default"` | Size preset |
| `isLoading` | `boolean` | `false` | Shows spinner icon and disables button |

#### States

- **Hover:** Background color shift
- **Active:** `scale(0.97)` micro-animation
- **Disabled/Loading:** `opacity-50`, `pointer-events-none`
- **Focus:** `ring-2 ring-ring` outline

#### Example

```tsx
import { Button } from "@/components/ui/button";

// Default blue button
<Button>Save Changes</Button>

// Loading state
<Button isLoading>Saving...</Button>

// Destructive action
<Button variant="destructive" size="sm">Delete</Button>

// Icon button
<Button variant="ghost" size="icon">
  <Plus className="h-4 w-4" />
</Button>

// Link variant
<Button variant="link">Learn more</Button>
```

---

### 2.2 Badge

> `src/components/ui/badge.tsx`

Inline status indicator with semantic color variants.

#### Variants

| Variant | Background | Text Color |
|---------|-----------|------------|
| `default` | `bg-primary` | `text-primary-foreground` |
| `secondary` | `bg-secondary` | `text-secondary-foreground` |
| `destructive` | `bg-destructive/10` | `text-destructive` |
| `outline` | transparent (border only) | `text-foreground` |
| `success` | `bg-emerald-500/10` | `text-emerald-600` |
| `warning` | `bg-amber-500/10` | `text-amber-600` |

#### Base Styles

- `rounded-full`, `border`, `px-2.5 py-0.5`, `text-xs`, `font-semibold`

#### Example

```tsx
import { Badge } from "@/components/ui/badge";

<Badge>Active</Badge>
<Badge variant="success">Approved</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="destructive">Rejected</Badge>
<Badge variant="outline">Draft</Badge>
```

---

### 2.3 Input

> `src/components/ui/input.tsx`

Minimalist text input with bottom-border-only style (no full border box).

#### Styles

- Height: `h-9` (36px)
- Border: bottom-only (`border-b border-border`)
- Background: transparent
- Placeholder: `text-muted-foreground/50`
- Focus: border changes to `foreground` color

#### States

- **Focus:** `border-foreground` (dark bottom line)
- **Disabled:** `opacity-50`, `cursor-not-allowed`

#### Example

```tsx
import { Input } from "@/components/ui/input";

<Input type="text" placeholder="Enter your name" />
<Input type="email" placeholder="email@example.com" disabled />
```

---

### 2.4 Textarea

> `src/components/ui/textarea.tsx`

Multi-line text input with the same underline style as Input.

#### Styles

- Min height: `min-h-[80px]`
- Border: bottom-only (`border-b border-border`)
- Background: transparent
- Resizable: `resize-y`

#### Example

```tsx
import { Textarea } from "@/components/ui/textarea";

<Textarea placeholder="Write a description..." />
```

---

### 2.5 Select

> `src/components/ui/select.tsx`

Native HTML select with underline styling consistent with Input.

#### Styles

- Height: `h-9`, `appearance-none`
- Border: bottom-only, transparent background
- Cursor: `pointer`

#### Example

```tsx
import { Select } from "@/components/ui/select";

<Select>
  <option value="">Choose an option</option>
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</Select>
```

---

### 2.6 SearchableMultiSelect

> `src/components/ui/searchable-multi-select.tsx`

Advanced multi-select dropdown with search, select-all, and accent-normalized filtering. Built on `cmdk` (Command) + Popover.

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `options` | `{ value: number; label: string; keywords?: string[] }[]` | Available options |
| `selected` | `number[]` | Currently selected values |
| `onToggle` | `(id: number) => void` | Toggle a single option |
| `onToggleAll` | `() => void` | Toggle all options |
| `placeholder` | `string` | Trigger button placeholder |
| `searchPlaceholder` | `string` | Search input placeholder |
| `emptyMessage` | `string` | Message when no results |
| `selectAllLabel` | `string` | Label for select-all option |
| `renderSummary` | `(selected) => ReactNode` | Custom summary renderer |

#### Features

- Accent-normalized search (handles accented Portuguese characters)
- Auto-summarizes selection (shows count when labels > 48 chars)
- Keyboard navigation via cmdk

#### Example

```tsx
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

<SearchableMultiSelect
  options={[
    { value: 1, label: "Marketing" },
    { value: 2, label: "Engineering" },
    { value: 3, label: "Sales" },
  ]}
  selected={[1, 3]}
  onToggle={(id) => toggle(id)}
  onToggleAll={() => toggleAll()}
  placeholder="Select departments"
  searchPlaceholder="Search departments..."
  emptyMessage="No departments found."
  selectAllLabel="Select all"
/>
```

---

### 2.7 Checkbox

> `src/components/ui/checkbox.tsx`

Radix UI checkbox with check icon indicator.

#### Styles

- Size: `h-4 w-4` (16x16px)
- Border: `border-primary`, `rounded-sm`
- Checked: `bg-primary text-primary-foreground`
- Indicator: Lucide `Check` icon

#### Example

```tsx
import { Checkbox } from "@/components/ui/checkbox";

<div className="flex items-center gap-2">
  <Checkbox id="terms" />
  <label htmlFor="terms">Accept terms</label>
</div>
```

---

### 2.8 RadioGroup

> `src/components/ui/radio-group.tsx`

Radix UI radio group with circle indicator.

#### Styles

- Layout: `grid gap-2`
- Item: `h-4 w-4`, `rounded-full`, `border-primary`
- Indicator: Lucide `Circle` icon, `fill-primary`

#### Example

```tsx
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

<RadioGroup defaultValue="option-1">
  <div className="flex items-center gap-2">
    <RadioGroupItem value="option-1" id="option-1" />
    <label htmlFor="option-1">Option 1</label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="option-2" id="option-2" />
    <label htmlFor="option-2">Option 2</label>
  </div>
</RadioGroup>
```

---

### 2.9 Switch

> `src/components/ui/switch.tsx`

Toggle switch with sliding thumb animation.

#### Styles

- Track: `h-5 w-9`, `rounded-full`
- Thumb: `h-4 w-4`, `rounded-full`, `shadow-lg`
- Checked: `bg-primary` / Unchecked: `bg-input`
- Thumb translate: `translate-x-4` when checked

#### Example

```tsx
import { Switch } from "@/components/ui/switch";

<div className="flex items-center gap-2">
  <Switch id="notifications" />
  <label htmlFor="notifications">Enable notifications</label>
</div>
```

---

### 2.10 Toggle & ToggleGroup

> `src/components/ui/toggle.tsx` | `src/components/ui/toggle-group.tsx`

Stateful toggle button(s) using CVA variants.

#### Toggle Variants

| Variant | Description |
|---------|------------|
| `default` | Transparent bg, accent bg when on |
| `outline` | Border + transparent bg, accent on hover/active |

#### Toggle Sizes

| Size | Height |
|------|--------|
| `default` | h-9 (36px) |
| `sm` | h-8 (32px) |
| `lg` | h-10 (40px) |

#### Example

```tsx
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Single toggle
<Toggle aria-label="Toggle bold">
  <Bold className="h-4 w-4" />
</Toggle>

// Toggle group
<ToggleGroup type="single" variant="outline">
  <ToggleGroupItem value="left">Left</ToggleGroupItem>
  <ToggleGroupItem value="center">Center</ToggleGroupItem>
  <ToggleGroupItem value="right">Right</ToggleGroupItem>
</ToggleGroup>
```

---

### 2.11 Slider

> `src/components/ui/slider.tsx`

Range slider with track, filled range, and draggable thumb.

#### Styles

- Track: `h-1.5`, `bg-primary/20`, `rounded-full`
- Range: `bg-primary`
- Thumb: `h-4 w-4`, `rounded-full`, `border-primary/50`, `bg-background`

#### Example

```tsx
import { Slider } from "@/components/ui/slider";

<Slider defaultValue={[50]} max={100} step={1} />
```

---

### 2.12 Label

> `src/components/ui/label.tsx`

Form field label with consistent styling.

#### Styles

- `text-xs`, `font-semibold`, `leading-none`, `mb-1`, `block`

#### Example

```tsx
import { Label } from "@/components/ui/label";

<Label htmlFor="name">Full Name</Label>
```

---

### 2.13 InputGroup

> `src/components/ui/input-group.tsx`

Composite input wrapper supporting addons (icons, buttons, text) at different positions.

#### Sub-components

| Component | Description |
|-----------|-------------|
| `InputGroup` | Container with border, focus ring, error states |
| `InputGroupAddon` | Addon container (align: inline-start, inline-end, block-start, block-end) |
| `InputGroupButton` | Button inside addon (sizes: xs, sm, icon-xs, icon-sm) |
| `InputGroupText` | Text/icon span inside addon |
| `InputGroupInput` | Styled input without its own border |
| `InputGroupTextarea` | Styled textarea without its own border |

#### Example

```tsx
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Search } from "lucide-react";

<InputGroup>
  <InputGroupAddon align="inline-start">
    <InputGroupText><Search className="h-4 w-4" /></InputGroupText>
  </InputGroupAddon>
  <InputGroupInput placeholder="Search..." />
</InputGroup>
```

---

### 2.14 Form (React Hook Form Integration)

> `src/components/ui/form.tsx`

Wrapper components for React Hook Form + Zod validation.

#### Sub-components

| Component | Description |
|-----------|-------------|
| `Form` | `FormProvider` from react-hook-form |
| `FormField` | `Controller` wrapper with context |
| `FormItem` | Field container (`space-y-2`) |
| `FormLabel` | Label with error-state coloring |
| `FormControl` | Slot with ARIA attributes (`aria-invalid`, `aria-describedby`) |
| `FormDescription` | Help text (`text-[0.8rem] text-muted-foreground`) |
| `FormMessage` | Error message (`text-[0.8rem] text-destructive font-medium`) |

#### Hook: `useFormField()`

Returns: `{ id, name, formItemId, formDescriptionId, formMessageId, ...fieldState }`

#### Example

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

---

### 2.15 Field / FieldSet

> `src/components/ui/field.tsx`

Structural components for grouping form fields with orientation support.

#### Sub-components

| Component | Description |
|-----------|-------------|
| `FieldSet` | `<fieldset>` container (`flex flex-col gap-6`) |
| `FieldLegend` | Legend text (variants: `legend` = text-base, `label` = text-sm) |
| `FieldGroup` | Container group with `@container/field-group` for responsive fields |
| `Field` | Single field wrapper (orientations: vertical, horizontal, responsive) |
| `FieldContent` | Content area within a field (`flex-1 gap-1.5`) |
| `FieldLabel` | Label with checked-state styling for checkbox/radio fields |
| `FieldTitle` | Title text (`text-sm font-medium`) |
| `FieldDescription` | Help text (`text-sm text-muted-foreground`) |
| `FieldSeparator` | Divider with optional label text |
| `FieldError` | Error display (`text-destructive`, `role="alert"`) |

#### Field Orientations

| Orientation | Behavior |
|-------------|----------|
| `vertical` | Stacked (default), label above input |
| `horizontal` | Side-by-side, label left of input |
| `responsive` | Vertical on mobile, horizontal on `@md/field-group` |

#### Example

```tsx
import {
  FieldSet, FieldGroup, Field, FieldLabel, FieldContent,
  FieldDescription, FieldError,
} from "@/components/ui/field";

<FieldSet>
  <FieldGroup>
    <Field orientation="responsive">
      <FieldLabel>Company Name</FieldLabel>
      <FieldContent>
        <Input placeholder="Acme Inc." />
        <FieldDescription>Legal entity name</FieldDescription>
        <FieldError errors={[{ message: "Required" }]} />
      </FieldContent>
    </Field>
  </FieldGroup>
</FieldSet>
```

---

### 2.16 Card

> `src/components/ui/card.tsx`

Container component with consistent border and shadow.

#### Sub-components

| Component | Styles |
|-----------|--------|
| `Card` | `rounded-2xl border bg-card shadow-sm` |
| `CardHeader` | `flex flex-col space-y-1.5 p-6` |
| `CardTitle` | `font-semibold text-xl tracking-tight leading-none` |
| `CardContent` | `p-6 pt-0` |

#### Example

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Overview</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Card content goes here.</p>
  </CardContent>
</Card>
```

---

### 2.17 Table

> `src/components/ui/table.tsx`

Semantic HTML table with hover states and selection support.

#### Sub-components

| Component | Key Styles |
|-----------|-----------|
| `Table` | `w-full caption-bottom text-sm` (wrapped in `overflow-auto`) |
| `TableHeader` | `[&_tr]:border-b` |
| `TableBody` | `[&_tr:last-child]:border-0` |
| `TableFooter` | `border-t bg-muted/50 font-medium` |
| `TableRow` | `border-b hover:bg-muted/50 data-[state=selected]:bg-muted` |
| `TableHead` | `h-10 px-2 font-medium text-muted-foreground` |
| `TableCell` | `p-2 align-middle` |
| `TableCaption` | `mt-4 text-sm text-muted-foreground` |

#### Example

```tsx
import {
  Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell,
} from "@/components/ui/table";

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Daton</TableCell>
      <TableCell><Badge variant="success">Active</Badge></TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

### 2.18 Avatar

> `src/components/ui/avatar.tsx`

Circular avatar with image and text fallback.

#### Sub-components

| Component | Styles |
|-----------|--------|
| `Avatar` | `h-10 w-10 rounded-full overflow-hidden` |
| `AvatarImage` | `aspect-square h-full w-full` |
| `AvatarFallback` | `h-full w-full bg-muted flex items-center justify-center` |

#### Example

```tsx
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

<Avatar>
  <AvatarImage src="/avatar.jpg" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

---

### 2.19 Separator

> `src/components/ui/separator.tsx`

Horizontal or vertical divider line.

#### Props

| Prop | Type | Default |
|------|------|---------|
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` |
| `decorative` | `boolean` | `true` |

#### Styles

- Horizontal: `h-[1px] w-full`
- Vertical: `h-full w-[1px]`
- Color: `bg-border`

#### Example

```tsx
import { Separator } from "@/components/ui/separator";

<Separator />
<Separator orientation="vertical" className="h-6" />
```

---

### 2.20 Progress

> `src/components/ui/progress.tsx`

Horizontal progress bar.

#### Styles

- Container: `h-2 rounded-full bg-primary/20`
- Indicator: `bg-primary`, animated with `transition-all`

#### Example

```tsx
import { Progress } from "@/components/ui/progress";

<Progress value={65} />
```

---

### 2.21 Tabs

> `src/components/ui/tabs.tsx`

Underline-style tab navigation.

#### Sub-components

| Component | Key Styles |
|-----------|-----------|
| `Tabs` | Root container (Radix) |
| `TabsList` | `flex gap-6 border-b text-muted-foreground` |
| `TabsTrigger` | `text-[13px] font-medium`, active: `font-semibold` + 2px underline |
| `TabsContent` | `mt-6`, focus ring support |

#### Active Tab Indicator

Active tab shows a 2px `bg-foreground` underline via `::after` pseudo-element with `rounded-full`.

#### Example

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

<Tabs defaultValue="general">
  <TabsList>
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="security">Security</TabsTrigger>
  </TabsList>
  <TabsContent value="general">General settings...</TabsContent>
  <TabsContent value="security">Security settings...</TabsContent>
</Tabs>
```

---

### 2.22 Breadcrumb

> `src/components/ui/breadcrumb.tsx`

Hierarchical navigation trail.

#### Sub-components

| Component | Description |
|-----------|-------------|
| `Breadcrumb` | `<nav aria-label="breadcrumb">` |
| `BreadcrumbList` | `<ol>` with `gap-1.5 text-sm text-muted-foreground` |
| `BreadcrumbItem` | `<li>` flex container |
| `BreadcrumbLink` | Anchor with hover `text-foreground` |
| `BreadcrumbPage` | Current page span (`aria-current="page"`, `text-foreground`) |
| `BreadcrumbSeparator` | `ChevronRight` icon (default) |
| `BreadcrumbEllipsis` | `MoreHorizontal` icon for truncation |

#### Example

```tsx
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/app">Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Current Page</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

---

### 2.23 Accordion

> `src/components/ui/accordion.tsx`

Expandable/collapsible content sections.

#### Sub-components

| Component | Key Styles |
|-----------|-----------|
| `Accordion` | Root (Radix) |
| `AccordionItem` | `border-b` |
| `AccordionTrigger` | `py-4 text-sm font-medium hover:underline`, ChevronDown icon rotates 180deg on open |
| `AccordionContent` | Animated `accordion-up`/`accordion-down`, padding `pb-4 pt-0` |

#### Example

```tsx
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";

<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Section Title</AccordionTrigger>
    <AccordionContent>
      Section content goes here.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

---

### 2.24 Collapsible

> `src/components/ui/collapsible.tsx`

Simple show/hide container (re-export of Radix Collapsible).

#### Components

- `Collapsible` (Root)
- `CollapsibleTrigger`
- `CollapsibleContent`

---

### 2.25 Dialog

> `src/components/ui/dialog.tsx`

Custom modal dialog with portal rendering, backdrop blur, and entrance animations.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | Controlled open state |
| `onOpenChange` | `(open: boolean) => void` | — | State change handler |
| `title` | `string` | — | Dialog heading |
| `description` | `string?` | — | Optional subheading |
| `size` | `"sm" \| "md" \| "lg" \| "xl" \| "2xl"` | `"md"` | Width preset |

#### Size Map

| Size | Max Width |
|------|-----------|
| `sm` | `max-w-md` (28rem / 448px) |
| `md` | `max-w-lg` (32rem / 512px) |
| `lg` | `max-w-2xl` (42rem / 672px) |
| `xl` | `max-w-4xl` (56rem / 896px) |
| `2xl` | `max-w-5xl` (64rem / 1024px) |

#### Features

- Portal rendered to `document.body`
- Backdrop: `bg-black/20 backdrop-blur-[2px]`
- Scroll lock: `document.body.style.overflow = "hidden"`
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`
- Animations: `overlayIn` (200ms), `modalIn` (250ms cubic-bezier)

#### Sub-components

- `DialogFooter`: `flex justify-end gap-2 pt-5 mt-2 border-t`

#### Example

```tsx
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

<Dialog
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Create Department"
  description="Add a new department to the organization."
  size="md"
>
  <form>
    {/* Form fields */}
    <DialogFooter>
      <Button variant="secondary" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button type="submit">Create</Button>
    </DialogFooter>
  </form>
</Dialog>
```

---

### 2.26 Sheet

> `src/components/ui/sheet.tsx`

Slide-out panel from any edge, built on Radix Dialog.

#### Variants (side)

| Side | Behavior |
|------|----------|
| `top` | Slides down from top |
| `bottom` | Slides up from bottom |
| `left` | Slides from left, `w-3/4 sm:max-w-sm` |
| `right` | Slides from right (default), `w-3/4 sm:max-w-sm` |

#### Sub-components

- `Sheet`, `SheetTrigger`, `SheetClose`, `SheetPortal`, `SheetOverlay`
- `SheetContent` (main panel with close button)
- `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`

#### Example

```tsx
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader,
  SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">Open Panel</Button>
  </SheetTrigger>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Settings</SheetTitle>
      <SheetDescription>Adjust your preferences.</SheetDescription>
    </SheetHeader>
    {/* Content */}
  </SheetContent>
</Sheet>
```

---

### 2.27 Drawer

> `src/components/ui/drawer.tsx`

Bottom drawer (mobile-optimized) built on Vaul.

#### Features

- Scales background (`shouldScaleBackground: true`)
- Grab handle: `h-2 w-[100px] rounded-full bg-muted`
- Fixed to bottom: `rounded-t-[10px]`

#### Sub-components

- `Drawer`, `DrawerTrigger`, `DrawerClose`, `DrawerPortal`, `DrawerOverlay`
- `DrawerContent` (with grab handle)
- `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`

#### Example

```tsx
import {
  Drawer, DrawerTrigger, DrawerContent, DrawerHeader,
  DrawerTitle, DrawerFooter,
} from "@/components/ui/drawer";

<Drawer>
  <DrawerTrigger asChild>
    <Button>Open Drawer</Button>
  </DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Select an option</DrawerTitle>
    </DrawerHeader>
    {/* Content */}
    <DrawerFooter>
      <Button>Confirm</Button>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

---

### 2.28 Popover

> `src/components/ui/popover.tsx`

Floating content panel anchored to a trigger element.

#### Props (PopoverContent)

| Prop | Default | Description |
|------|---------|-------------|
| `align` | `"center"` | Alignment relative to trigger |
| `sideOffset` | `4` | Distance from trigger (px) |

#### Styles

- `z-[220]`, `w-72`, `rounded-md`, `border`, `bg-popover`, `p-4`, `shadow-md`
- Animate: fade + zoom + slide based on `data-side`

#### Example

```tsx
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">Info</Button>
  </PopoverTrigger>
  <PopoverContent>
    <p>Additional information here.</p>
  </PopoverContent>
</Popover>
```

---

### 2.29 DropdownMenu

> `src/components/ui/dropdown-menu.tsx`

Context-aware dropdown menu with submenus, checkboxes, and radio items.

#### Sub-components

| Component | Description |
|-----------|-------------|
| `DropdownMenu` | Root |
| `DropdownMenuTrigger` | Trigger element |
| `DropdownMenuContent` | Menu panel (`min-w-[8rem]`, `rounded-md`, `shadow-md`) |
| `DropdownMenuItem` | Standard item (`px-2 py-1.5 text-sm`, hover: `bg-accent`) |
| `DropdownMenuCheckboxItem` | Item with checkbox indicator |
| `DropdownMenuRadioItem` | Item with radio indicator |
| `DropdownMenuLabel` | Non-interactive label (`font-semibold`) |
| `DropdownMenuSeparator` | Divider line |
| `DropdownMenuShortcut` | Right-aligned shortcut text |
| `DropdownMenuSub` / `SubTrigger` / `SubContent` | Nested submenu |
| `DropdownMenuGroup` / `RadioGroup` | Grouping containers |

#### Example

```tsx
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem>Duplicate</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

### 2.30 ContextMenu

> `src/components/ui/context-menu.tsx`

Right-click context menu. Same structure and API as DropdownMenu.

---

### 2.31 Tooltip

> `src/components/ui/tooltip.tsx`

Small floating label on hover/focus.

#### Styles

- Background: `bg-primary` (blue)
- Text: `text-xs text-primary-foreground`
- Padding: `px-3 py-1.5`
- `sideOffset: 4` (default)

#### Example

```tsx
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Info className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Helpful tooltip text</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

### 2.32 HoverCard

> `src/components/ui/hover-card.tsx`

Rich content tooltip on hover. Similar to Popover but triggered by hover.

#### Styles

- `w-64`, `rounded-md`, `border`, `bg-popover`, `p-4`, `shadow-md`
- Same animate-in/out as Popover

---

### 2.33 Toast (Radix) & Sonner

> `src/components/ui/toast.tsx` | `src/components/ui/sonner.tsx` | `src/hooks/use-toast.ts`

Dual toast system: Radix UI Toast (programmatic) and Sonner (library).

#### Radix Toast

**Variants:**
| Variant | Styles |
|---------|--------|
| `default` | `bg-background text-foreground border` |
| `destructive` | `bg-destructive text-destructive-foreground border-destructive` |

**Positioning:** Top on mobile, bottom-right on desktop (`sm:bottom-0 sm:right-0`)

**Limit:** 1 toast visible at a time (`TOAST_LIMIT = 1`)

**Sub-components:** `ToastProvider`, `ToastViewport`, `Toast`, `ToastTitle`, `ToastDescription`, `ToastClose`, `ToastAction`

#### Sonner Toast

Theme-aware wrapper using `next-themes`:

```tsx
import { Toaster } from "@/components/ui/sonner";

// In app root
<Toaster />
```

#### useToast Hook

```tsx
import { useToast } from "@/hooks/use-toast";

const { toast, dismiss } = useToast();

toast({
  title: "Success",
  description: "Operation completed.",
});

// Destructive toast
toast({
  variant: "destructive",
  title: "Error",
  description: "Something went wrong.",
});
```

---

### 2.34 Alert

> `src/components/ui/alert.tsx`

Static alert banner with icon support.

#### Variants

| Variant | Styles |
|---------|--------|
| `default` | `bg-background text-foreground` |
| `destructive` | `border-destructive/50 text-destructive` |

#### Sub-components

- `Alert`: Container (`role="alert"`, `rounded-lg border px-4 py-3`)
- `AlertTitle`: `font-medium leading-none tracking-tight`
- `AlertDescription`: `text-sm [&_p]:leading-relaxed`

#### Example

```tsx
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Your session has expired.</AlertDescription>
</Alert>
```

---

### 2.35 Spinner

> `src/components/ui/spinner.tsx`

Simple loading indicator.

#### Styles

- Icon: Lucide `Loader2Icon`
- Size: `size-4` (16px) default
- Animation: `animate-spin`
- ARIA: `role="status"`, `aria-label="Loading"`

#### Example

```tsx
import { Spinner } from "@/components/ui/spinner";

<Spinner />
<Spinner className="size-6" /> {/* Larger spinner */}
```

---

### 2.36 Skeleton

> `src/components/ui/skeleton.tsx`

Loading placeholder with pulse animation.

#### Styles

- `animate-pulse`, `rounded-md`, `bg-primary/10`

#### Example

```tsx
import { Skeleton } from "@/components/ui/skeleton";

{/* Text line placeholder */}
<Skeleton className="h-4 w-[200px]" />

{/* Avatar placeholder */}
<Skeleton className="h-10 w-10 rounded-full" />

{/* Card placeholder */}
<Skeleton className="h-[200px] w-full rounded-2xl" />
```

---

### 2.37 Empty

> `src/components/ui/empty.tsx`

Empty state display for when no data is available.

#### Sub-components

| Component | Description |
|-----------|-------------|
| `Empty` | Container (`border-dashed rounded-lg p-6 md:p-12`, centered flex) |
| `EmptyHeader` | Header group (`max-w-sm gap-2`) |
| `EmptyMedia` | Icon container (variants: `default`, `icon` with `bg-muted size-10 rounded-lg`) |
| `EmptyTitle` | Title (`text-lg font-medium tracking-tight`) |
| `EmptyDescription` | Description (`text-sm text-muted-foreground`) |
| `EmptyContent` | Action area (`max-w-sm gap-4`) |

#### Example

```tsx
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle,
  EmptyDescription, EmptyContent,
} from "@/components/ui/empty";
import { FileText } from "lucide-react";

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <FileText />
    </EmptyMedia>
    <EmptyTitle>No documents found</EmptyTitle>
    <EmptyDescription>
      Start by uploading your first document.
    </EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Upload Document</Button>
  </EmptyContent>
</Empty>
```

---

### 2.38 ButtonGroup

> `src/components/ui/button-group.tsx`

Group multiple buttons with merged borders.

#### Orientations

| Orientation | Behavior |
|-------------|----------|
| `horizontal` | Side-by-side, shared borders between items |
| `vertical` | Stacked, shared borders between items |

#### Sub-components

- `ButtonGroup`: Container with border-merging styles
- `ButtonGroupText`: Static text item (`bg-muted border px-4`)
- `ButtonGroupSeparator`: Divider between items

#### Example

```tsx
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";

<ButtonGroup orientation="horizontal">
  <Button variant="outline">Left</Button>
  <ButtonGroupSeparator />
  <Button variant="outline">Right</Button>
</ButtonGroup>
```

---

### 2.39 ScrollArea

> `src/components/ui/scroll-area.tsx`

Custom scrollbar container using Radix ScrollArea primitive.

---

### 2.40 ResizablePanel

> `src/components/ui/resizable.tsx`

Resizable panel layout using `react-resizable-panels`.

---

### 2.41 AspectRatio

> `src/components/ui/aspect-ratio.tsx`

Container that maintains a specified aspect ratio. Re-export of Radix AspectRatio.

---

### 2.42 Sidebar

> `src/components/ui/sidebar.tsx`

Complex navigation sidebar with mobile responsiveness, collapsible states, and tooltips.

#### Architecture

| Component | Description |
|-----------|-------------|
| `SidebarProvider` | Context provider with cookie-based state persistence |
| `Sidebar` | Main container (variants: `sidebar`, `floating`, `inset`; sides: `left`, `right`) |
| `SidebarTrigger` | Toggle button |
| `SidebarRail` | Thin rail for drag-to-expand |
| `SidebarContent` | Scrollable content area |
| `SidebarHeader` / `SidebarFooter` | Fixed header/footer areas |
| `SidebarGroup` | Section with label and action |
| `SidebarMenu` / `SidebarMenuItem` | Menu list |
| `SidebarMenuButton` | Interactive button (sizes: sm/default/lg, variants: default/outline) |
| `SidebarMenuAction` / `SidebarMenuBadge` | Action button and badge in menu items |
| `SidebarMenuSub` / `SidebarMenuSubButton` | Nested submenu |

#### Dimensions

| State | Width |
|-------|-------|
| Expanded | `16rem` (256px) |
| Mobile | `18rem` (288px) via Sheet |
| Icon-only | `3rem` (48px) |

#### Keyboard Shortcut

Toggle with `Cmd+B` (Mac) / `Ctrl+B` (Windows).

#### Mobile Behavior

On mobile (`< 768px`), sidebar renders as a `Sheet` component.

#### Hook: `useSidebar()`

Returns: `{ state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }`

---

### 2.43 Additional Components

These components are available but follow standard shadcn/ui patterns:

- **Carousel** (`carousel.tsx`) — Embla Carousel wrapper with prev/next controls
- **Chart** (`chart.tsx`) — Recharts wrapper with theme-aware colors
- **Menubar** (`menubar.tsx`) — Desktop menu bar (Radix Menubar)
- **NavigationMenu** (`navigation-menu.tsx`) — Complex navigation (Radix NavigationMenu)
- **InputOTP** (`input-otp.tsx`) — One-time password input
- **Kbd** (`kbd.tsx`) — Keyboard key visual
- **Item** (`item.tsx`) — Generic list item wrapper
- **DialogStepTabs** (`dialog-step-tabs.tsx`) — Multi-step dialog with tab navigation

---

## 3. Animations & Transitions

All custom animations are defined in `src/index.css`.

### 3.1 Keyframe Animations

| Name | Effect | Duration | Easing | Usage |
|------|--------|----------|--------|-------|
| `overlayIn` | `opacity: 0 → 1` | 200ms | ease-out | Dialog/modal backdrop |
| `modalIn` | `scale(0.96) translateY(6px) → scale(1) translateY(0)` | 250ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Dialog entrance |
| `chatSlideIn` | `translateX(100%) → translateX(0)` | — | — | Chat panel open |
| `chatSlideOut` | `translateX(0) → translateX(100%)` | — | — | Chat panel close |
| `popoverIn` | `scale(0.95) translateX(-4px) → scale(1) translateX(0)` | — | — | Popover entrance |
| `fadeInUp` | `opacity: 0, translateY(8px) → opacity: 1, translateY(0)` | 300ms | ease-out | General entrance |
| `accordion-down` | Height `0 → var(--radix-accordion-content-height)` | — | — | Accordion open |
| `accordion-up` | Height `var(...) → 0` | — | — | Accordion close |

### 3.2 Micro-interactions

| Element | Effect | Implementation |
|---------|--------|----------------|
| Button press | Scale down | `active:scale-[0.97]` |
| Tab switch | Color transition | `transition-colors duration-200` |
| Input focus | Border color change | `transition-colors` |
| Popover enter/exit | Fade + zoom + slide | `data-[state=open]:animate-in data-[state=closed]:animate-out` |
| Sheet slide | Direction-based slide | CVA side variants with slide animations |
| Accordion chevron | 180deg rotation | `[data-state=open]>svg:rotate-180`, `transition-transform duration-200` |
| Switch thumb | Horizontal slide | `transition-transform`, `translate-x-4` |
| Toast swipe | Horizontal dismiss | Radix swipe gesture with translateX |

### 3.3 CSS Definition

```css
@keyframes overlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes chatSlideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes chatSlideOut {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}

@keyframes popoverIn {
  from { opacity: 0; transform: scale(0.95) translateX(-4px); }
  to { opacity: 1; transform: scale(1) translateX(0); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up {
  animation: fadeInUp 300ms ease-out both;
}
```

---

## 4. UX Patterns & Guidelines

### 4.1 Loading States

| Pattern | Component | When to Use |
|---------|-----------|-------------|
| Button spinner | `<Button isLoading>` | During form submission or async action |
| Inline spinner | `<Spinner />` | Small loading indicators |
| Skeleton | `<Skeleton />` | Content placeholder while data loads |
| Full page | Loading text in Router | Initial app/auth loading |

**Guidelines:**
- Always disable the triggering button during loading (`isLoading` does this automatically)
- Use Skeleton loaders for content that has a predictable shape
- Use Spinner for unpredictable content or inline loading

### 4.2 Error Handling

| Pattern | Component | When to Use |
|---------|-----------|-------------|
| Toast notification | `useToast()` / `sonner` | API errors, operation failures |
| Inline form error | `<FormMessage />` / `<FieldError />` | Field validation errors |
| Alert banner | `<Alert variant="destructive">` | Persistent error states |

**Guidelines:**
- Show max 1 toast at a time (`TOAST_LIMIT = 1`)
- Use Zod schemas for all form validation
- Display field errors inline, below the input
- Error messages use `text-destructive` color

### 4.3 Responsive Design

**Strategy:** Mobile-first with progressive enhancement.

| Breakpoint | Behavior |
|------------|----------|
| `< 768px` | Sidebar becomes Sheet (drawer), single-column layouts, toast at top |
| `≥ 768px` | Sidebar visible, multi-column grids, toast at bottom-right |
| `≥ 1280px` | Expanded grid layouts (up to 5 columns) |

**Key responsive patterns:**
- `Field orientation="responsive"`: Vertical on mobile, horizontal on desktop
- Sidebar: Sheet on mobile, fixed sidebar on desktop
- Grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-5`

### 4.4 Navigation

| Pattern | Component | Behavior |
|---------|-----------|----------|
| Primary nav | `Sidebar` | Collapsible, keyboard toggle (Cmd+B), icon-only state |
| Page context | `Breadcrumb` | Shows hierarchy path |
| Sub-navigation | `Tabs` | Underline-style tab switching |
| Actions menu | `DropdownMenu` | Context actions for items |

**Sidebar sections:**
- Organizacao (Organization)
- Qualidade (Quality)
- Governanca (Governance)
- Configuracoes (Settings)

### 4.5 Forms

**Pattern:** Labels above inputs, underline-style inputs, Zod validation.

| Element | Style |
|---------|-------|
| Label | `text-xs font-semibold mb-1` |
| Input | Bottom-border only, transparent bg |
| Error | `text-[0.8rem] text-destructive font-medium` |
| Description | `text-[0.8rem] text-muted-foreground` |
| Field spacing | `space-y-2` within FormItem, `gap-6` between fields |

**Validation flow:**
1. Define Zod schema
2. Create form with `useForm({ resolver: zodResolver(schema) })`
3. Wrap in `<Form>` provider
4. Use `<FormField>` + `<FormControl>` + `<FormMessage>`

### 4.6 Empty States

**Pattern:** Centered layout with icon, title, description, and optional CTA.

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><Icon /></EmptyMedia>
    <EmptyTitle>No items yet</EmptyTitle>
    <EmptyDescription>Get started by creating your first item.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Create Item</Button>
  </EmptyContent>
</Empty>
```

**Guidelines:**
- Always provide a clear CTA to resolve the empty state
- Use `border-dashed` container to indicate the area can be populated
- Keep descriptions concise and action-oriented

### 4.7 Toasts

| Position | Platform |
|----------|----------|
| Top center | Mobile (`< sm`) |
| Bottom right | Desktop (`≥ sm`) |

**Guidelines:**
- Maximum 1 toast visible at a time
- Use `variant="destructive"` for error toasts
- Include title and brief description
- Auto-dismiss after delay

---

## 5. Accessibility

### 5.1 ARIA Attributes

| Pattern | Attribute | Component |
|---------|-----------|-----------|
| Alerts | `role="alert"` | Alert, FieldError, FormMessage |
| Dialogs | `role="dialog"`, `aria-modal="true"` | Dialog |
| Labels | `aria-labelledby`, `aria-describedby` | Dialog, Form fields |
| Validation | `aria-invalid={!!error}` | FormControl |
| Current page | `aria-current="page"` | BreadcrumbPage |
| Decorative | `aria-hidden="true"` | Separators, icons |
| Loading | `role="status"`, `aria-label="Loading"` | Spinner |
| Groups | `role="group"` | ButtonGroup, InputGroup, Field |

### 5.2 Keyboard Navigation

| Shortcut | Action | Component |
|----------|--------|-----------|
| `Cmd+B` / `Ctrl+B` | Toggle sidebar | Sidebar |
| `Tab` | Focus navigation | All interactive elements |
| `Enter` / `Space` | Activate | Buttons, toggles, menu items |
| `Escape` | Close | Dialog, Sheet, Popover, DropdownMenu |
| `Arrow keys` | Navigate | Menu items, radio groups, accordion |

### 5.3 Focus Management

- **Focus rings:** `focus-visible:ring-2 focus-visible:ring-ring` on all interactive elements
- **Focus ring offset:** `focus-visible:ring-offset-2 focus-visible:ring-offset-background`
- **Scroll lock:** Dialog locks body scroll when open
- **Focus trap:** Radix primitives handle focus trapping in overlays

### 5.4 Screen Reader Support

- Semantic HTML: `<nav>`, `<main>`, `<form>`, `<table>`, `<h1>`–`<h6>`
- Screen reader text: `<span className="sr-only">` for icon-only buttons
- Breadcrumb: `<nav aria-label="breadcrumb">`
- Table: Semantic `<thead>`, `<tbody>`, `<th>`, `<td>`

---

## 6. Icons

### Library

**Lucide React** — consistent, customizable SVG icon set.

```tsx
import { IconName } from "lucide-react";
```

### Size Standards

| Context | Class | Size |
|---------|-------|------|
| Default (buttons, menu items) | `h-4 w-4` or `size-4` | 16px |
| Header / prominent | `h-6 w-6` or `size-6` | 24px |
| Small (indicators) | `h-3 w-3` or `size-3` | 12px |
| Spinner | `size-4` | 16px |

### Commonly Used Icons

| Icon | Import | Usage |
|------|--------|-------|
| `Bell` | `lucide-react` | Notifications |
| `Building2` | `lucide-react` | Organization |
| `ChevronRight` | `lucide-react` | Breadcrumb separator, navigation |
| `ChevronDown` | `lucide-react` | Accordion, select indicators |
| `Check` | `lucide-react` | Checkbox, selection indicator |
| `X` | `lucide-react` | Close buttons, clear |
| `Plus` | `lucide-react` | Add/create actions |
| `Trash2` | `lucide-react` | Delete actions |
| `Pencil` | `lucide-react` | Edit actions |
| `Search` | `lucide-react` | Search inputs |
| `Loader2` | `lucide-react` | Loading spinner (with `animate-spin`) |
| `Settings` | `lucide-react` | Settings navigation |
| `LogOut` | `lucide-react` | Logout action |
| `Eye` / `EyeOff` | `lucide-react` | Password visibility toggle |
| `Send` | `lucide-react` | Chat/submit |
| `Sparkles` | `lucide-react` | AI features |
| `Scale` | `lucide-react` | Legal/compliance |
| `MoreHorizontal` | `lucide-react` | Overflow menu trigger |

---

## 7. Dark Mode Specification (Future)

The application currently uses light mode only. The infrastructure for dark mode is in place (`next-themes` installed, Sonner respects theme). Below is the proposed dark mode token specification.

### 7.1 Proposed Dark Mode Tokens

```css
.dark {
  /* Backgrounds - dark with subtle blue tint */
  --background: 240 10% 6%;       /* ~#0F0F12 */
  --foreground: 0 0% 95%;         /* ~#F2F2F2 */

  --card: 240 10% 8%;             /* ~#131317 */
  --card-foreground: 0 0% 95%;

  /* Borders - subtle, low contrast */
  --border: 240 6% 18%;           /* ~#2B2B30 */
  --input: 240 6% 18%;
  --ring: 211 100% 55%;           /* Slightly lighter blue for visibility */

  /* Primary - slightly lighter for dark backgrounds */
  --primary: 211 100% 55%;        /* ~#2E96FF */
  --primary-foreground: 0 0% 100%;

  /* Secondary */
  --secondary: 240 5% 14%;        /* ~#222226 */
  --secondary-foreground: 0 0% 90%;

  /* Muted */
  --muted: 240 5% 14%;
  --muted-foreground: 240 4% 60%; /* ~#9494A0 */

  /* Accent */
  --accent: 211 60% 15%;          /* Dark blue tint */
  --accent-foreground: 211 100% 70%;

  /* Destructive */
  --destructive: 0 84% 60%;       /* Same red, works on dark */
  --destructive-foreground: 0 0% 100%;

  /* Sidebar */
  --sidebar: 240 10% 7%;
  --sidebar-foreground: 0 0% 90%;
  --sidebar-border: 240 6% 16%;
  --sidebar-accent: 240 5% 12%;
  --sidebar-accent-foreground: 0 0% 95%;

  --radius: 0.75rem;
}
```

### 7.2 Implementation Notes

1. **Enable `next-themes`:** Wrap app root with `<ThemeProvider attribute="class" defaultTheme="system">`.
2. **Toggle component:** Add a theme toggle button using `useTheme()` from `next-themes`.
3. **Testing:** All semantic color tokens automatically adapt. Hardcoded values (e.g., `bg-[#007AFF]` in Button, `bg-white` in SearchableMultiSelect) must be replaced with token-based classes.
4. **Known hardcoded values to update:**
   - `button.tsx`: `bg-[#007AFF]`, `hover:bg-[#0066DD]` → `bg-primary`, `hover:bg-primary/90`
   - `searchable-multi-select.tsx`: `bg-white` → `bg-card` or `bg-popover`

---

## 8. Tech Stack Reference

### Core Framework

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.1.0 | UI framework |
| TypeScript | — | Type safety |
| Vite | — | Build tool |

### Styling

| Technology | Purpose |
|-----------|---------|
| Tailwind CSS 4 | Utility-first CSS |
| CSS Custom Properties | Design tokens (HSL) |
| class-variance-authority (CVA) | Component variants |
| clsx + tailwind-merge | Class merging via `cn()` utility |

### Component Primitives

| Technology | Purpose |
|-----------|---------|
| shadcn/ui (new-york preset) | Component templates |
| Radix UI | Accessible headless primitives |
| Vaul | Drawer component |
| cmdk | Command/search palette |

### Data & State

| Technology | Purpose |
|-----------|---------|
| TanStack React Query | Server state, caching |
| React Hook Form | Form state management |
| Zod | Schema validation |
| React Context | Auth, Layout state |

### Routing & Navigation

| Technology | Purpose |
|-----------|---------|
| Wouter | Lightweight client-side routing |

### UI Enhancements

| Technology | Purpose |
|-----------|---------|
| Lucide React | Icon library |
| Sonner | Toast notifications |
| Recharts | Data visualization |
| react-day-picker | Date selection |
| embla-carousel-react | Carousel/slider |
| react-resizable-panels | Resizable layouts |
| next-themes | Theme management |
| react-markdown | Markdown rendering |

### Utility: `cn()`

The cornerstone utility for all component styling:

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## Appendix: File Index

| Component | File Path |
|-----------|-----------|
| Global Styles & Tokens | `src/index.css` |
| Utility Functions | `src/lib/utils.ts` |
| shadcn Configuration | `components.json` |
| **Form & Input** | |
| Button | `src/components/ui/button.tsx` |
| Input | `src/components/ui/input.tsx` |
| Textarea | `src/components/ui/textarea.tsx` |
| Select | `src/components/ui/select.tsx` |
| SearchableMultiSelect | `src/components/ui/searchable-multi-select.tsx` |
| Checkbox | `src/components/ui/checkbox.tsx` |
| RadioGroup | `src/components/ui/radio-group.tsx` |
| Switch | `src/components/ui/switch.tsx` |
| Toggle / ToggleGroup | `src/components/ui/toggle.tsx`, `toggle-group.tsx` |
| Slider | `src/components/ui/slider.tsx` |
| Label | `src/components/ui/label.tsx` |
| InputGroup | `src/components/ui/input-group.tsx` |
| InputOTP | `src/components/ui/input-otp.tsx` |
| Form | `src/components/ui/form.tsx` |
| Field / FieldSet | `src/components/ui/field.tsx` |
| **Data Display** | |
| Badge | `src/components/ui/badge.tsx` |
| Card | `src/components/ui/card.tsx` |
| Table | `src/components/ui/table.tsx` |
| Avatar | `src/components/ui/avatar.tsx` |
| Separator | `src/components/ui/separator.tsx` |
| Progress | `src/components/ui/progress.tsx` |
| **Navigation** | |
| Sidebar | `src/components/ui/sidebar.tsx` |
| Tabs | `src/components/ui/tabs.tsx` |
| Breadcrumb | `src/components/ui/breadcrumb.tsx` |
| Accordion | `src/components/ui/accordion.tsx` |
| Collapsible | `src/components/ui/collapsible.tsx` |
| **Overlays** | |
| Dialog | `src/components/ui/dialog.tsx` |
| Sheet | `src/components/ui/sheet.tsx` |
| Drawer | `src/components/ui/drawer.tsx` |
| Popover | `src/components/ui/popover.tsx` |
| DropdownMenu | `src/components/ui/dropdown-menu.tsx` |
| ContextMenu | `src/components/ui/context-menu.tsx` |
| Tooltip | `src/components/ui/tooltip.tsx` |
| HoverCard | `src/components/ui/hover-card.tsx` |
| **Feedback** | |
| Toast | `src/components/ui/toast.tsx` |
| Toaster | `src/components/ui/toaster.tsx` |
| Sonner | `src/components/ui/sonner.tsx` |
| Alert | `src/components/ui/alert.tsx` |
| Spinner | `src/components/ui/spinner.tsx` |
| Skeleton | `src/components/ui/skeleton.tsx` |
| Empty | `src/components/ui/empty.tsx` |
| **Layout** | |
| ButtonGroup | `src/components/ui/button-group.tsx` |
| ScrollArea | `src/components/ui/scroll-area.tsx` |
| ResizablePanel | `src/components/ui/resizable.tsx` |
| AspectRatio | `src/components/ui/aspect-ratio.tsx` |
| **Other** | |
| Carousel | `src/components/ui/carousel.tsx` |
| Chart | `src/components/ui/chart.tsx` |
| Menubar | `src/components/ui/menubar.tsx` |
| NavigationMenu | `src/components/ui/navigation-menu.tsx` |
| Kbd | `src/components/ui/kbd.tsx` |
| Item | `src/components/ui/item.tsx` |
| DialogStepTabs | `src/components/ui/dialog-step-tabs.tsx` |
| **Hooks** | |
| useIsMobile | `src/hooks/use-mobile.tsx` |
| useToast | `src/hooks/use-toast.ts` |
| **Contexts** | |
| AuthContext | `src/contexts/AuthContext.tsx` |
| LayoutContext | `src/contexts/LayoutContext.tsx` |
| **Layouts** | |
| AppLayout | `src/components/layout/AppLayout.tsx` |
| AdminLayout | `src/components/layout/AdminLayout.tsx` |
