import { useState, type ImgHTMLAttributes } from "react";
import { getProductImageByName } from "../../../lib/productImages";

const EMPTY_PRODUCT_IMAGE = "/images/products/empty.png";

type ProductImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  name?: string | null;
};

export function ProductImage({ name, alt, onError, ...rest }: ProductImageProps) {
  const [errored, setErrored] = useState(false);
  const resolved = name ? getProductImageByName(name) : EMPTY_PRODUCT_IMAGE;
  const src = errored ? EMPTY_PRODUCT_IMAGE : resolved;
  return (
    <img
      src={src}
      alt={alt ?? name ?? ""}
      onError={(e) => {
        setErrored(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
}

export default ProductImage;
