import { OrderImage } from '../services/orders.service';

/**
 * Utility to handle specialized natural sorting for media items.
 * Requirement: Skip the first number (ID) and sort based on the remaining string.
 * Example: "123456-pic-1" should be sorted by "pic-1".
 */
export class SortingUtils {
  static sortMedia(media: OrderImage[]): OrderImage[] {
    if (!media || media.length === 0) return media;

    return [...media].sort((a, b) => {
      const nameA = a.originalName || a.filename || '';
      const nameB = b.originalName || b.filename || '';

      // Find the first hyphen to skip the initial ID
      const indexA = nameA.indexOf('-');
      const indexB = nameB.indexOf('-');

      // If no hyphen, just use the full name
      const sortPartA = indexA !== -1 ? nameA.substring(indexA + 1) : nameA;
      const sortPartB = indexB !== -1 ? nameB.substring(indexB + 1) : nameB;

      // Natural sort using localeCompare with numeric: true
      return sortPartA.localeCompare(sortPartB, undefined, { 
        numeric: true, 
        sensitivity: 'base' 
      });
    });
  }
}
