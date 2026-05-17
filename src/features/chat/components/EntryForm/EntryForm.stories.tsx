import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import { fn } from 'storybook/test';
import EntryForm from './index';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

type EntryFormProps = ComponentProps<typeof EntryForm>;

type EntryFormStoryArgs = Partial<
  Pick<EntryFormProps, 'name' | 'color' | 'email' | 'error' | 'isPending' | 'onEnter'>
>;

function EntryFormContainer({
  name: initialName = 'ゆい',
  color: initialColor = '#ff69b4',
  email: initialEmail = '',
  error,
  isPending,
  onEnter,
}: EntryFormStoryArgs = {}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [email, setEmail] = useState(initialEmail);

  // Storybook controls で initial 値が変わったら state を巻き戻す
  // (useResetOnChange = effect 内 setState を避ける公式推奨「前回値検知」パターン)
  useResetOnChange(initialName, setName);
  useResetOnChange(initialColor, setColor);
  useResetOnChange(initialEmail, setEmail);

  return (
    <EntryForm
      name={name}
      setName={setName}
      color={color}
      setColor={setColor}
      email={email}
      setEmail={setEmail}
      error={error}
      isPending={isPending}
      onEnter={onEnter ?? fn()}
    />
  );
}

const meta = {
  component: EntryForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    error: {
      control: 'text',
      description: 'フォーム送信エラーの文言',
    },
    isPending: {
      control: 'boolean',
      description: '送信中かどうか',
    },
  },
} satisfies Meta<typeof EntryForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const noopStringDispatch = (() => undefined) as Dispatch<SetStateAction<string>>;

export const Default: Story = {
  args: {
    name: 'ゆい',
    color: '#ff69b4',
    email: '',
    onEnter: fn(),
    setName: noopStringDispatch,
    setColor: noopStringDispatch,
    setEmail: noopStringDispatch,
  } satisfies Partial<EntryFormProps>,
  render: (args) => (
    <div className="max-w-md">
      <EntryFormContainer {...(args as EntryFormStoryArgs)} />
    </div>
  ),
};

export const WithError: Story = {
  args: {
    name: 'ゆい',
    color: '#ff69b4',
    email: '',
    error: 'おなまえを入力してください',
    onEnter: fn(),
    setName: noopStringDispatch,
    setColor: noopStringDispatch,
    setEmail: noopStringDispatch,
  } satisfies Partial<EntryFormProps>,
  render: (args) => (
    <div className="max-w-md">
      <EntryFormContainer {...(args as EntryFormStoryArgs)} />
    </div>
  ),
};

export const Pending: Story = {
  args: {
    name: 'ゆい',
    color: '#ff69b4',
    email: '',
    isPending: true,
    onEnter: fn(),
    setName: noopStringDispatch,
    setColor: noopStringDispatch,
    setEmail: noopStringDispatch,
  } satisfies Partial<EntryFormProps>,
  render: (args) => (
    <div className="max-w-md">
      <EntryFormContainer {...(args as EntryFormStoryArgs)} />
    </div>
  ),
};
