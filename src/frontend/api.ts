import { treaty } from '@elysiajs/eden'
import {createEdenOptionsProxy} from 'eden-tanstack-react-query';
import type { Api } from "../backend/api";

const client = treaty<Api>(location.origin)
export const {api} = createEdenOptionsProxy<Api>({client})
