import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import ChanariEntryForm from './index';
import '../../styles/chanari.css';

type ChanariEntryFormProps = ComponentProps<typeof ChanariEntryForm>;

type ChanariEntryFormStoryArgs = Partial<
  Pick<
    ChanariEntryFormProps,
    'name' | 'nameColor' | 'speechColor' | 'sid' | 'error' | 'isPending' | 'onEnter'
  >
>;

function ChanariEntryFormContainer({
  name: initialName = 'ゆい',
  nameColor: initialNameColor = '#ff69b4',
  speechColor: initialSpeechColor = '#333333',
  sid = 'storybook-session',
  error,
  isPending,
  onEnter,
}: ChanariEntryFormStoryArgs = {}) {
  const [name, setName] = useState(initialName);
  const [nameColor, setNameColor] = useState(initialNameColor);
  const [speechColor, setSpeechColor] = useState(initialSpeechColor);

  return (
    <ChanariEntryForm
      name={name}
      setName={setName}
      nameColor={nameColor}
      setNameColor={setNameColor}
      speechColor={speechColor}
      setSpeechColor={setSpeechColor}
      sid={sid}
      error={error}
      isPending={isPending}
      onEnter={onEnter ?? fn()}
    />
  );
}

const meta = {
  component: ChanariEntryForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="chanari-scope">
        <Story />
      </div>
    ),
  ],
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
} satisfies Meta<typeof ChanariEntryForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const noopStringSetter = () => undefined;

export const Default: Story = {
  args: {
    name: 'ゆい',
    nameColor: '#ff69b4',
    speechColor: '#333333',
    sid: 'storybook-session',
    setName: noopStringSetter,
    setNameColor: noopStringSetter,
    setSpeechColor: noopStringSetter,
    onEnter: fn(),
  },
  render: (args) => <ChanariEntryFormContainer {...(args as ChanariEntryFormStoryArgs)} />,
};

export const WithError: Story = {
  args: {
    ...Default.args,
    error: 'おなまえを入力してください',
  },
  render: Default.render,
};

export const Pending: Story = {
  args: {
    ...Default.args,
    isPending: true,
  },
  render: Default.render,
};
