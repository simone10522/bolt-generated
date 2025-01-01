import React, { useEffect, useState } from 'react';
    import { useParams, useNavigate } from 'react-router-dom';
    import { supabase } from '../lib/supabase';
    import { useAuth } from '../hooks/useAuth';
    import ParticipantList from '../components/ParticipantList';

    interface Participant {
      id: string;
      username: string;
    }

    export default function ManageParticipants() {
      const { id } = useParams<{ id: string }>();
      const { user } = useAuth();
      const navigate = useNavigate();
      const [participants, setParticipants] = useState<Participant[]>([]);
      const [error, setError] = useState('');

      useEffect(() => {
        fetchParticipants();
      }, []);

      const fetchParticipants = async () => {
        const { data, error } = await supabase
          .from('tournament_participants')
          .select(`
            id,
            profiles:participant_id (username)
          `)
          .eq('tournament_id', id);
        if (error) {
          setError(error.message);
        } else {
          setParticipants(data?.map(p => ({ id: p.id, username: p.profiles.username })) || []);
        }
      };

      const handleJoinTournament = async () => {
        if (!user) {
          setError('You must be logged in to join a tournament.');
          return;
        }

        try {
          const { error } = await supabase
            .from('tournament_participants')
            .insert([{ tournament_id: id, participant_id: user.id }]); // Assuming participant_id is user.id
          if (error) throw error;
          fetchParticipants();
        } catch (error: any) {
          setError(error.message);
        }
      };

      const handleRemoveParticipant = async (participantId: string) => {
        try {
          const { error } = await supabase
            .from('tournament_participants')
            .delete()
            .eq('id', participantId);
          if (error) throw error;
          fetchParticipants();
        } catch (error: any) {
          setError(error.message);
        }
      };

      return (
        <div>
          <h1>Manage Participants</h1>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          {user && (
            <button onClick={handleJoinTournament}>Join Tournament</button>
          )}
          <ParticipantList participants={participants.map(p => p.username)} onRemove={handleRemoveParticipant} />
        </div>
      );
    }
