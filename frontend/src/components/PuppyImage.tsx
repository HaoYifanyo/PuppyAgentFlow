import React from 'react';
import { defaultPuppy } from '../assets/puppies';

interface PuppyImageProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  rounded?: boolean;
}

export const PuppyImage: React.FC<PuppyImageProps> = ({
  src = defaultPuppy,
  alt = 'Cute puppy',
  size = 'md',
  className = '',
  rounded = true,
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <img
      src={src}
      alt={alt}
      className={`${sizeClasses[size]} object-cover ${rounded ? 'rounded-full' : ''} ${className}`}
      onError={(e) => {
        // Prevent infinite loop if fallback also fails
        if (e.currentTarget.src !== defaultPuppy) {
          e.currentTarget.src = defaultPuppy;
        }
      }}
    />
  );
};