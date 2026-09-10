<?php

namespace App\Notifications\Exceptions;

/**
 * The provider rejected the request itself (4xx — e.g. malformed number,
 * invalid instance/apikey). NOT recoverable by retrying with the same
 * payload — the caller (SendWhatsAppNotificationJob) treats this as a
 * final failure instead of consuming retry attempts uselessly (§12).
 */
class WhatsAppClientException extends WhatsAppProviderException
{
    public function __construct(string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
