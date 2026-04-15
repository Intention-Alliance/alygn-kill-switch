// Root page → redirect to /kill-switch

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/kill-switch');
}