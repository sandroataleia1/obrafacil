<?php

namespace App\Notifications\Exceptions;

/** The provider itself errored (5xx). Recoverable — safe to retry. */
class WhatsAppServerException extends WhatsAppProviderException
{
    public function __construct(string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
