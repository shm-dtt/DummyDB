import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs'; // nextra-theme-blog or your custom theme
import { MDXComponents } from 'nextra/mdx-components';

const themeComponents = getThemeComponents();

export function useMDXComponents(components?: MDXComponents) {
  return {
    ...themeComponents,
    ...components
  };
}