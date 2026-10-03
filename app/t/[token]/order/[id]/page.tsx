import { notFound } from "next/navigation";
import { z } from "zod";

import { OrderTracker } from "@/components/guest/order-tracker";

export default async function GuestOrderPage({ params, searchParams }: PageProps<"/t/[token]/order/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  // ?pay=1: the guest just chose "Place order & pay", so open checkout straight away.
  return <OrderTracker orderId={id} autoPay={(await searchParams).pay === "1"} />;
}
