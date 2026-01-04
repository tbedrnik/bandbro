import { IconEye, IconEyeOff } from "@tabler/icons-react"
import type { StandardSchemaV1Issue } from '@tanstack/react-form';
import {
  createFormHook,
  createFormHookContexts,
  useStore,
} from '@tanstack/react-form';
import {
  type ReactNode,
  useState,
} from 'react';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Textarea } from './textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { FieldLabel, FieldError } from './field';

// export useFieldContext for use in your custom components
export const { fieldContext, formContext, useFieldContext } =
  createFormHookContexts();

const FormFieldLabel = (props: Omit<React.ComponentProps<typeof FieldLabel>, 'htmlFor'>) => {
  const field = useFieldContext<string | number | boolean>();

  return (
    <FieldLabel htmlFor={field.name} {...props} />
  );
};

const FormFieldErrors = () => {
  const field = useFieldContext<string | number | boolean>();

  const isBlurred = useStore(field.store, (state) => state.meta.isBlurred);

  const isSubmitAttempted = useStore(
    field.form.store,
    (state) => state.submissionAttempts > 0,
  );

  const errors = useStore(
    field.store,
    (state) => state.meta.errors as StandardSchemaV1Issue[],
  );

  if (field.state.meta.isValidating) {
    return (
      <p className="text-xs font-medium text-destructive">
        Validating...
      </p>
    );
  }

  // The validators can be defined to run onChange, onBlur, onSubmit - or any combination of those
  // But we want to show error messages consistently: user must blur the field once or submit the form
  const canShowErrors = isBlurred || isSubmitAttempted;

  if (!canShowErrors) {
    return null;
  }

  return <FieldError errors={errors} />
};

const FormInput = (props: Omit<React.ComponentProps<typeof Input>, 'name' | 'id' | 'value' | 'onChange' | 'onBlur'>) => {
  const field = useFieldContext<string | number>();

  return (
    <Input
      {...props}
      name={field.name}
      id={field.name}
      value={field.state.value}
      onChange={(e) =>
        field.handleChange(
          props.type === 'number' ? e.target.valueAsNumber : e.target.value,
        )
      }
      onBlur={() => field.handleBlur()}
    />
  );
};

const FormInputPassword = (props: Omit<React.ComponentProps<typeof Input>, 'name' | 'id' | 'value' | 'onChange' | 'onBlur' | 'type'>) => {
  const [showPassword, setShowPassword] = useState(false);
  const field = useFieldContext<string | number>();

  return (
    <div className="relative w-full">
      <Input
        {...props}
        className="w-full pr-8"
        type={showPassword ? 'text' : 'password'}
        name={field.name}
        id={field.name}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={() => field.handleBlur()}
      />
      <Button
        className="absolute top-0.5 right-1.5 w-7 h-7 rounded-full"
        type="button"
        tabIndex={-1}
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.preventDefault();
          setShowPassword((s) => !s);
        }}
      >
        {showPassword ? <IconEye /> : <IconEyeOff />}
      </Button>
    </div>
  );
};

const FormTextarea = (props: Omit<React.ComponentProps<typeof Textarea>, 'name' | 'id' | 'value' | 'onChange' | 'onBlur'>) => {
  const field = useFieldContext<string | number>();

  return (
    <Textarea
      {...props}
      name={field.name}
      id={field.name}
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={() => field.handleBlur()}
    />
  );
};

type FormSelectProps = {
  options: { value: string; label: ReactNode }[];
  selectPlaceholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
} & (
    | {
      isLoading: boolean;
      loadingPlaceholder: string;
    }
    | {
      isLoading?: never;
      loadingPlaceholder?: never;
    }
  );

const FormSelect = ({
  options,
  selectPlaceholder = 'Select an option...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  disabled,
}: FormSelectProps) => {
  const field = useFieldContext<string | null>();

  const fieldValue = field.state.value;
  const defaultValue = typeof fieldValue === 'string' ? fieldValue : undefined;

  const handleChange = (value: string | null) => {
    field.handleChange(value);
    field.handleBlur();
  };

  return (
    <Select value={fieldValue} onValueChange={handleChange}>
      <SelectTrigger disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    // <Combobox
    //   id={field.name}
    //   name={field.name}
    //   defaultValue={defaultValue}
    //   items={options}
    //   selectPlaceholder={selectPlaceholder}
    //   searchPlaceholder={searchPlaceholder}
    //   emptyMessage={emptyMessage}
    //   disabled={disabled}
    //   onChange={handleChange}
    // />
  );
};

const FormCheckbox = (props: Omit<
  React.ComponentProps<typeof Checkbox>,
  'id' | 'checked' | 'onCheckedChange' | 'onBlur'
>) => {
  const field = useFieldContext<boolean>();

  return (
    <Checkbox
      {...props}
      id={field.name}
      checked={field.state.value}
      onCheckedChange={(checked) => field.handleChange(checked === true)}
      onBlur={() => field.handleBlur()}
    />
  );
};

const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    Label: FormFieldLabel,
    Errors: FormFieldErrors,
    Input: FormInput,
    Password: FormInputPassword,
    Textarea: FormTextarea,
    Select: FormSelect,
    Checkbox: FormCheckbox,
  },
  formComponents: {},
});

export { useAppForm };
