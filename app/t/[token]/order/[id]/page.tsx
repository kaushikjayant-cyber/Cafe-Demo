import { notFound } from "next/navigation";
import { z } from "zod";

import { OrderTracker } from "@/components/guest/order-tracker";

export default async function GuestOrderPage({ params }: PageProps<"/t/[token]/order/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <OrderTracker orderId={id} />;
}
