import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import ChanariColorPicker from './index';
import '../../styles/chanari.css';

type ChanariColorPickerProps = ComponentProps<typeof ChanariColorPicker>;

function ChanariColorPickerContainer({
  value: initialValue = '#ff69b4',
  ariaLabel,
  onChange,
}: Partial<ChanariColorPickerProps>) {
  const [value, setValue] = useState(initialValue);

  return (
    <span>
      <ChanariColorPicker
        value={value}
        ariaLabel={ariaLabel}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />{' '}
      <span>{value}</span>
    </span>
  );
}

const meta = {
  component: ChanariColorPicker,
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
  args: {
    value: '#ff69b4',
    ariaLabel: '名前色カラーピッカー',
    onChange: fn(),
  },
  argTypes: {
    value: {
      control: 'color',
      description: '現在の色コード',
    },
    ariaLabel: {
      control: 'text',
      description: '非表示の color input に付与するラベル',
    },
  },
  render: (args) => <ChanariColorPickerContainer {...args} />,
} satisfies Meta<typeof ChanariColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
