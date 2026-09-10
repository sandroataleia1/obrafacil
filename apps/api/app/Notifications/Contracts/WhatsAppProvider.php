<?php

namespace App\Notifications\Contracts;

use App\Notifications\Support\WhatsAppSendResult;

/**
 * Every WhatsApp send in the app goes through this contract — no domain
 * code, job, or controller ever depends on EvolutionApiProvider (or any
 * other concrete implementation) directly (Gate BACKEND-03 §2/§5).
 */
interface WhatsAppProvider
{
    /**
     * @param  string  $recipient  Canonical E.164 (e.g. +5511999999999) —
     *                             implementations normalize to whatever format they actually need;
     *                             the caller never has to know or care.
     */
    public function sendText(string $recipient, string $message): WhatsAppSendResult;
}
