import type { Meta, StoryObj } from '@storybook/react';
import {
  useEffect,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { fn } from 'storybook/test';
import EntryForm from './index';

type EntryFormProps = ComponentProps<typeof EntryForm>;

type EntryFormStoryArgs = Partial<
  Pick<
    EntryFormProps,
    'name' | 'color' | 'email' | 'windowRows' | 'error' | 'isPending' | 'onEnter'
  >
>;

function EntryFormContainer({
  name: initialName = 'ゆい',
  color: initialColor = '#ff69b4',
  email: initialEmail = '',
  windowRows: initialRows = 30,
  error,
  isPending,
  onEnter,
}: EntryFormStoryArgs = {}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [email, setEmail] = useState(initialEmail);
  const [windowRows, setWindowRows] = useState(initialRows);

  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => setColor(initialColor), [initialColor]);
  useEffect(() => setEmail(initialEmail), [initialEmail]);
  useEffect(() => setWindowRows(initialRows), [initialRows]);

  return (
    <EntryForm
      name={name}
      setName={setName}
      color={color}
      setColor={setColor}
      email={email}
      setEmail={setEmail}
      windowRows={windowRows}
      setWindowRows={setWindowRows}
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
const noopNumberDispatch = (() => undefined) as Dispatch<SetStateAction<number>>;

export const Default: Story = {
  args: {
    name: 'ゆい',
    color: '#ff69b4',
    email: '',
    windowRows: 30,
    onEnter: fn(),
    setName: noopStringDispatch,
    setColor: noopStringDispatch,
    setEmail: noopStringDispatch,
    setWindowRows: noopNumberDispatch,
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
    windowRows: 30,
    error: 'おなまえを入力してください',
    onEnter: fn(),
    setName: noopStringDispatch,
    setColor: noopStringDispatch,
    setEmail: noopStringDispatch,
    setWindowRows: noopNumberDispatch,
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
    windowRows: 30,
    isPending: true,
    onEnter: fn(),
    setName: noopStringDispatch,
    setColor: noopStringDispatch,
    setEmail: noopStringDispatch,
    setWindowRows: noopNumberDispatch,
  } satisfies Partial<EntryFormProps>,
  render: (args) => (
    <div className="max-w-md">
      <EntryFormContainer {...(args as EntryFormStoryArgs)} />
    </div>
  ),
};
