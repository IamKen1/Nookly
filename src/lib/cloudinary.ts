export const getImageUrl = (imageUrl: string | null | undefined): string => {
  if (!imageUrl) return "/placeholder-product.svg";
  if (imageUrl.startsWith("http")) return imageUrl;
  return "/placeholder-product.svg";
};

export const isCloudinaryUrl = (url: string): boolean => url.includes("cloudinary.com");

export const extractPublicIdFromUrl = (cloudinaryUrl: string): string | null => {
  const match = cloudinaryUrl.match(/\/v\d+\/(.+)\./);
  return match ? match[1] : null;
};

export const getOptimizedImageUrl = (
  url: string,
  options?: { width?: number; height?: number; quality?: string | number; crop?: string }
): string => {
  if (!url || !isCloudinaryUrl(url)) return url;

  const transformations: string[] = [];
  if (options?.width) transformations.push(`w_${options.width}`);
  if (options?.height) transformations.push(`h_${options.height}`);
  if (options?.quality) transformations.push(`q_${options.quality}`);
  if (options?.crop) transformations.push(`c_${options.crop}`);
  transformations.push("f_auto");

  const parts = url.split("/upload/");
  if (parts.length !== 2) return url;
  return `${parts[0]}/upload/${transformations.join(",")}/${parts[1]}`;
};
