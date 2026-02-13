# Form UX Guidelines

Standards for consistent, accessible, and user-friendly forms across the Metabolic-Tracker application.

**Last Updated:** 2024-01-15

---

## Table of Contents

1. [Form Structure](#form-structure)
2. [Field Labels and Help Text](#field-labels-and-help-text)
3. [Required Fields](#required-fields)
4. [Validation Patterns](#validation-patterns)
5. [Error Messages](#error-messages)
6. [Loading States](#loading-states)
7. [Button Placement](#button-placement)
8. [Accessibility](#accessibility)
9. [Mobile Optimization](#mobile-optimization)
10. [Code Examples](#code-examples)

---

## Form Structure

### Layout Principles

1. **Single Column Layout**: Use single-column layouts for forms. Multi-column layouts increase cognitive load and error rates.

2. **Logical Grouping**: Group related fields together with clear section headings.

3. **Progressive Disclosure**: Show optional fields only when needed. Use accordions or "Show more" patterns.

4. **Field Order**: Arrange fields in the order users expect:
   - Name before email
   - Email before password
   - Required fields before optional

### Spacing Standards

```css
/* Field spacing */
.form-field {
  margin-bottom: 1.5rem; /* 24px between fields */
}

/* Section spacing */
.form-section {
  margin-bottom: 2rem; /* 32px between sections */
}

/* Label to input spacing */
label {
  margin-bottom: 0.5rem; /* 8px */
}
```

---

## Field Labels and Help Text

### Label Requirements

1. **Always Visible**: Labels must always be visible (no placeholder-only labels)
2. **Position**: Labels above input fields, not inline
3. **Concise**: 1-3 words when possible
4. **Sentence Case**: "Email address" not "EMAIL ADDRESS"

### Help Text

Use help text for:
- Format requirements ("Use format: MM/DD/YYYY")
- Constraints ("Maximum 500 characters")
- Context ("This will be visible to your coach")

```tsx
<div className="form-field">
  <Label htmlFor="email">Email address</Label>
  <Input id="email" type="email" />
  <p className="text-sm text-muted-foreground mt-1">
    We'll use this for login and notifications
  </p>
</div>
```

### Placeholder Text

- Use for examples, not labels: `placeholder="e.g., john@example.com"`
- Never use as the only label
- Keep short (disappears on focus)

---

## Required Fields

### Visual Indicator

Mark required fields with a red asterisk after the label:

```tsx
<Label htmlFor="name">
  Full name <span className="text-red-500">*</span>
</Label>
```

### Consistency Rules

1. **All or None**: If most fields are required, mark optional fields instead:
   ```tsx
   <Label>Coach assignment <span className="text-muted-foreground">(Optional)</span></Label>
   ```

2. **Form-Level Indicator**: Add helper text at the top of forms:
   ```tsx
   <p className="text-sm text-muted-foreground mb-4">
     Fields marked with <span className="text-red-500">*</span> are required
   </p>
   ```

### ARIA Requirements

```tsx
<Input
  id="email"
  type="email"
  aria-required="true"
  aria-describedby="email-error"
/>
```

---

## Validation Patterns

### When to Validate

| Timing | Use For | Example |
|--------|---------|---------|
| On blur | Format validation | Email format, phone format |
| On change | Character limits | "47/50 characters" |
| On submit | All validations | Form submission |
| Real-time | Password requirements | Strength meter updating |

### Validation Rules by Field Type

#### Email
```typescript
const emailSchema = z.string()
  .min(1, "Email is required")
  .email("Please enter a valid email address");
```

#### Password
```typescript
const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[0-9]/, "Include at least one number")
  .regex(/[^A-Za-z0-9]/, "Include at least one special character");
```

#### Name
```typescript
const nameSchema = z.string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be less than 100 characters")
  .regex(/^[a-zA-Z\s\-']+$/, "Name can only contain letters, spaces, hyphens, and apostrophes");
```

#### Phone (Optional)
```typescript
const phoneSchema = z.string()
  .optional()
  .refine(
    (val) => !val || /^\+?[\d\s\-()]+$/.test(val),
    "Please enter a valid phone number"
  );
```

#### Numeric Values (Metrics)
```typescript
const glucoseSchema = z.number()
  .min(20, "Value seems too low - please verify")
  .max(600, "Value seems too high - please verify");

const weightSchema = z.number()
  .min(50, "Value seems too low - please verify")
  .max(700, "Value seems too high - please verify");
```

### Inline Validation Display

```tsx
// Show validation state immediately on blur
<Input
  className={cn(
    errors.email && "border-red-500 focus:ring-red-500"
  )}
  onBlur={() => trigger("email")}
/>
{errors.email && (
  <p className="text-sm text-red-500 mt-1" role="alert">
    {errors.email.message}
  </p>
)}
```

---

## Error Messages

### Message Format

1. **Specific**: Tell users exactly what's wrong
2. **Actionable**: Explain how to fix it
3. **Friendly**: No technical jargon or blame

### Standard Error Templates

| Issue | Bad | Good |
|-------|-----|------|
| Required field | "Required" | "Please enter your email address" |
| Invalid format | "Invalid" | "Please enter a valid email (e.g., name@example.com)" |
| Too short | "Min 8" | "Password must be at least 8 characters" |
| Out of range | "Invalid value" | "Blood glucose should be between 20-600 mg/dL" |
| Network error | "Error" | "Unable to save. Please check your connection and try again." |

### Error Message Component

```tsx
interface FormErrorProps {
  message?: string;
  id: string;
}

function FormError({ message, id }: FormErrorProps) {
  if (!message) return null;

  return (
    <p
      id={id}
      className="text-sm text-red-500 mt-1 flex items-center gap-1"
      role="alert"
      aria-live="polite"
    >
      <AlertCircle className="h-4 w-4" />
      {message}
    </p>
  );
}
```

### Field-Level vs Form-Level Errors

**Field-Level** (next to the field):
- Validation errors (format, length, required)
- Field-specific issues

**Form-Level** (top of form):
- Server errors
- Authentication failures
- Network issues
- Business logic errors (e.g., "This email is already registered")

```tsx
{formError && (
  <Alert variant="destructive" className="mb-4">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{formError}</AlertDescription>
  </Alert>
)}
```

---

## Loading States

### Button Loading State

```tsx
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Saving...
    </>
  ) : (
    "Save"
  )}
</Button>
```

### Form Disabled During Submit

```tsx
<fieldset disabled={isSubmitting}>
  {/* All form fields */}
</fieldset>
```

### Loading Text by Action

| Action | Loading Text | Success Text |
|--------|--------------|--------------|
| Create | "Creating..." | "Created successfully" |
| Save | "Saving..." | "Saved" |
| Submit | "Submitting..." | "Submitted" |
| Delete | "Deleting..." | "Deleted" |
| Send | "Sending..." | "Sent" |

### Success Feedback

Always confirm successful submission:

```tsx
const { toast } = useToast();

const onSubmit = async (data: FormData) => {
  try {
    await saveData(data);
    toast({
      title: "Entry saved",
      description: "Your glucose reading has been logged.",
    });
  } catch (error) {
    toast({
      variant: "destructive",
      title: "Save failed",
      description: "Please try again or contact support.",
    });
  }
};
```

---

## Button Placement

### Primary Action Position

- **Modal/Dialog**: Bottom right
- **Full Page Form**: Bottom left or full width
- **Inline Form**: Right side

### Button Order (Left to Right)

1. **Cancel/Back** (secondary/ghost style)
2. **Primary Action** (solid/primary style)

```tsx
<div className="flex justify-end gap-3 mt-6">
  <Button variant="ghost" type="button" onClick={onCancel}>
    Cancel
  </Button>
  <Button type="submit">
    Save Entry
  </Button>
</div>
```

### Button Labels

| Avoid | Use |
|-------|-----|
| OK | Save, Submit, Continue |
| Yes | Confirm, Delete, Remove |
| No | Cancel, Go Back |
| Click Here | [Describe the action] |

### Destructive Actions

```tsx
<Button variant="destructive" type="button">
  <Trash2 className="mr-2 h-4 w-4" />
  Delete Entry
</Button>
```

Always require confirmation for destructive actions:

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your glucose entry.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Accessibility

### ARIA Labels

Every form control must have an accessible name:

```tsx
// Using visible label (preferred)
<Label htmlFor="glucose">Blood Glucose</Label>
<Input id="glucose" type="number" />

// Using aria-label (when label not visible)
<Input aria-label="Search messages" type="search" />

// Using aria-labelledby (complex cases)
<div id="weight-label">Weight</div>
<Input aria-labelledby="weight-label weight-unit" />
<span id="weight-unit">(lbs)</span>
```

### Error Announcements

```tsx
<Input
  id="email"
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? "email-error" : undefined}
/>
{errors.email && (
  <p id="email-error" role="alert" aria-live="assertive">
    {errors.email.message}
  </p>
)}
```

### Focus Management

1. **Auto-focus first field** on modal open
2. **Move focus to first error** on form submission failure
3. **Return focus** to trigger element on modal close

```tsx
// Focus first error on submit
const onSubmit = async (data: FormData) => {
  const result = await submitForm(data);
  if (!result.success) {
    const firstErrorField = Object.keys(errors)[0];
    document.getElementById(firstErrorField)?.focus();
  }
};
```

### Keyboard Navigation

- Tab: Move between fields
- Enter: Submit form (in text inputs)
- Escape: Close modal/cancel
- Space: Toggle checkboxes, open selects

### Color Contrast

- Error text: #dc2626 (red-600) on white background
- Help text: #6b7280 (gray-500) - meets 4.5:1 ratio
- Never rely on color alone - use icons or text

---

## Mobile Optimization

### Input Types

Use appropriate input types for mobile keyboards:

| Field | Type | Keyboard |
|-------|------|----------|
| Email | `type="email"` | @ symbol visible |
| Phone | `type="tel"` | Number pad |
| Number | `type="number"` or `inputmode="numeric"` | Number pad |
| Date | `type="date"` | Date picker |
| Password | `type="password"` | Standard |

```tsx
<Input
  type="number"
  inputMode="decimal"
  pattern="[0-9]*\.?[0-9]*"
/>
```

### Touch Targets

Minimum touch target: 44x44 pixels

```css
.form-field input,
.form-field button {
  min-height: 44px;
  padding: 12px 16px;
}
```

### Mobile Form Layout

```tsx
<form className="space-y-4 px-4 pb-safe">
  {/* Fields */}

  {/* Sticky submit button on mobile */}
  <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:relative md:border-0 md:p-0">
    <Button type="submit" className="w-full md:w-auto">
      Save Entry
    </Button>
  </div>
</form>
```

### Avoid on Mobile

- Hover-only interactions
- Tiny click targets
- Long forms without progress indication
- Modals that don't fit viewport

---

## Code Examples

### Complete Form Component

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const metricSchema = z.object({
  type: z.enum(["glucose", "weight", "blood_pressure"]),
  value: z.number().min(1, "Value is required"),
  date: z.string().min(1, "Date is required"),
  notes: z.string().max(500, "Notes must be less than 500 characters").optional(),
});

type MetricForm = z.infer<typeof metricSchema>;

export function MetricEntryForm({ onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MetricForm>({
    resolver: zodResolver(metricSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Form-level required indicator */}
      <p className="text-sm text-muted-foreground">
        <span className="text-red-500">*</span> Required fields
      </p>

      {/* Metric Type */}
      <div className="space-y-2">
        <Label htmlFor="type">
          Metric type <span className="text-red-500">*</span>
        </Label>
        <Select {...register("type")}>
          <SelectTrigger id="type" aria-required="true">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="glucose">Blood Glucose</SelectItem>
            <SelectItem value="weight">Weight</SelectItem>
            <SelectItem value="blood_pressure">Blood Pressure</SelectItem>
          </SelectContent>
        </Select>
        {errors.type && (
          <FormError id="type-error" message={errors.type.message} />
        )}
      </div>

      {/* Value */}
      <div className="space-y-2">
        <Label htmlFor="value">
          Value <span className="text-red-500">*</span>
        </Label>
        <Input
          id="value"
          type="number"
          inputMode="decimal"
          {...register("value", { valueAsNumber: true })}
          aria-required="true"
          aria-invalid={!!errors.value}
          aria-describedby={errors.value ? "value-error" : "value-help"}
          className={cn(errors.value && "border-red-500")}
        />
        <p id="value-help" className="text-sm text-muted-foreground">
          Enter your reading value
        </p>
        {errors.value && (
          <FormError id="value-error" message={errors.value.message} />
        )}
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="date">
          Date <span className="text-red-500">*</span>
        </Label>
        <Input
          id="date"
          type="date"
          {...register("date")}
          aria-required="true"
        />
        {errors.date && (
          <FormError id="date-error" message={errors.date.message} />
        )}
      </div>

      {/* Notes (Optional) */}
      <div className="space-y-2">
        <Label htmlFor="notes">
          Notes <span className="text-muted-foreground">(Optional)</span>
        </Label>
        <Textarea
          id="notes"
          {...register("notes")}
          maxLength={500}
          aria-describedby="notes-help"
        />
        <p id="notes-help" className="text-sm text-muted-foreground">
          Add any relevant context (max 500 characters)
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Entry"
          )}
        </Button>
      </div>
    </form>
  );
}
```

---

## Checklist for New Forms

Before shipping a form, verify:

### Structure
- [ ] Single column layout
- [ ] Logical field order
- [ ] Related fields grouped

### Labels
- [ ] All fields have visible labels
- [ ] Labels above inputs
- [ ] Required fields marked with *
- [ ] Help text where needed

### Validation
- [ ] All required fields validated
- [ ] Format validation on blur
- [ ] Clear error messages
- [ ] Errors shown inline

### Accessibility
- [ ] All inputs have `id` and matching `htmlFor`
- [ ] Error messages have `role="alert"`
- [ ] `aria-invalid` on error fields
- [ ] `aria-describedby` for help/error text
- [ ] Focus moves to first error on submit

### Mobile
- [ ] Appropriate input types
- [ ] Touch targets 44px minimum
- [ ] Form usable on small screens

### Feedback
- [ ] Loading state on submit
- [ ] Success confirmation (toast)
- [ ] Form disabled during submit

---

*These guidelines ensure a consistent, accessible experience across the Metabolic-Tracker application. When in doubt, prioritize clarity and accessibility over visual design.*
