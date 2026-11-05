import { normaliseIdentifier, type GateEventPayload } from '@digigate/core';
import { useState } from 'react';

import { plateInput } from '@/lib/format';

/**
 * The plate the guard gives for a car: read off a photo and confirmed, or typed. Kept with the check is how it was
 * given, so a guard's slip can be told from a car carrying someone else's disc: whether it came off the photo, what the
 * photo read, and the plate as it stood when the guard was told it didn't match the disc.
 */
export function usePlateEntry() {
  const [plate, setPlate] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [readFromPhoto, setReadFromPhoto] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [warnedPlate, setWarnedPlate] = useState<string | null>(null);

  const normalised = normaliseIdentifier(plate);
  const fromPhoto = photo !== null && readFromPhoto !== null && normalised === readFromPhoto;

  return {
    plate,
    normalised,
    photo,
    typing,
    cameraOpen,
    fromPhoto,
    /** The plate as it was when the guard was told it didn't match the disc, or null if they weren't. */
    warnedPlate,
    setPlate: (text: string) => setPlate(plateInput(text)),
    openCamera: () => setCameraOpen(true),
    closeCamera: () => setCameraOpen(false),
    startTyping: () => setTyping(true),
    /** The guard confirmed what was read off the photo. */
    acceptPhoto: (shot: string, read: string) => {
      setPhoto(shot);
      setReadFromPhoto(read);
      setPlate(read);
      setTyping(false);
      setCameraOpen(false);
    },
    /** The guard will type it, starting from a reading that was nearly right. */
    typeIt: (shot: string | null, read: string | null, startFrom: string | null) => {
      if (shot) {
        setPhoto(shot);
        setReadFromPhoto(read);
      }
      if (startFrom) setPlate(startFrom);
      setTyping(true);
      setCameraOpen(false);
    },
    warn: () => setWarnedPlate(normalised),
    payload: (): GateEventPayload => ({
      source: fromPhoto ? 'photo' : 'typed',
      photo: photo !== null,
      read_from_photo: readFromPhoto,
      warned_plate: warnedPlate,
    }),
    reset: () => {
      setPlate('');
      setPhoto(null);
      setReadFromPhoto(null);
      setTyping(false);
      setCameraOpen(false);
      setWarnedPlate(null);
    },
  };
}

export type PlateEntry = ReturnType<typeof usePlateEntry>;
