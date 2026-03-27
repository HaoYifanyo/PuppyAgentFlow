import React from 'react';
import { puppyImages } from '../assets/puppies';
import { PuppyImage } from './PuppyImage';

interface PuppyImageSelectorProps {
  selectedImage?: string;
  onSelect: (imageUrl: string) => void;
}

export const PuppyImageSelector: React.FC<PuppyImageSelectorProps> = ({
  selectedImage,
  onSelect,
}) => {
  const imageEntries = Object.entries(puppyImages);

  return (
    <div className="flex flex-wrap gap-3 p-3 bg-white rounded-lg border border-gray-200">
      {imageEntries.map(([name, url]) => (
        <button
          key={name}
          onClick={() => onSelect(url)}
          className={`p-1 rounded-lg transition-all cursor-pointer ${
            selectedImage === url
              ? 'ring-2 ring-rose-400 bg-rose-50'
              : 'hover:bg-gray-50'
          }`}
          title={name}
        >
          <PuppyImage src={url} size="lg" alt={name} />
        </button>
      ))}
    </div>
  );
};