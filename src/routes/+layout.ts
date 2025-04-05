import type { LayoutLoad } from './$types'

export const load: LayoutLoad = async ({ data }) => {
  return data;
}

export const ssr = false;